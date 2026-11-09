import { randomBytes } from 'crypto';
import { FIXTURE_STEWARD, authenticatorFor, liveAccess, liveAuthenticator, tokenFromRequest, type Authenticator, type WorkspaceAccess } from './auth';
import { historyDigest, outputDigest } from './digest';
import { simulatedProvider } from './mockProvider';
import type { Actor, HistoryEntry, ModelOutput, Provider, SharedSession, TurnRequest } from './types';

export type WorkspaceDeps = {
  auth: Authenticator;
  access?: WorkspaceAccess;
  sessions: Map<string, SharedSession>;
  provider: Provider;
  locks: Map<string, Promise<void>>;
};

const liveSessions = new Map<string, SharedSession>();
const liveLocks = new Map<string, Promise<void>>();

export function liveDeps(): WorkspaceDeps {
  return {
    auth: liveAuthenticator(),
    access: liveAccess(),
    sessions: liveSessions,
    provider: simulatedProvider(),
    locks: liveLocks,
  };
}

export function freshDeps(over: Partial<WorkspaceDeps> = {}): WorkspaceDeps {
  return {
    auth: over.auth ?? authenticatorFor({ nodeEnv: 'test', sessionAuth: 'fixture' }),
    access: over.access,
    sessions: over.sessions ?? new Map(),
    provider: over.provider ?? simulatedProvider(),
    locks: over.locks ?? new Map(),
  };
}

function id(): string {
  return randomBytes(16).toString('hex');
}

function json(body: unknown, status = 200, extra?: HeadersInit): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...extra } });
}

function fail(error: string, status: number): Response {
  return json({ error }, status);
}

async function withLock<T>(deps: WorkspaceDeps, key: string, fn: () => Promise<T>): Promise<T> {
  const prev = deps.locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const tail = prev.then(() => gate);
  deps.locks.set(key, tail);
  await prev;
  try { return await fn(); }
  finally { release(); }
}

function isParticipant(session: SharedSession, actor: Actor): boolean {
  return session.participantIds.includes(actor.id);
}

function publicView(session: SharedSession) {
  return {
    id: session.id,
    history: session.history,
    requests: session.requests,
    outputs: session.outputs,
    releases: session.releases.map(item => ({ outputId: item.outputId, digest: item.digest, provider: item.provider })),
  };
}

function findSession(deps: WorkspaceDeps, sessionId: unknown): SharedSession | null {
  if (typeof sessionId !== 'string') return null;
  return deps.sessions.get(sessionId) ?? null;
}

function fixtureOpen(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.BAILEYOS_SESSION_AUTH === 'fixture';
}

export async function handleWorkspace(req: Request, deps: WorkspaceDeps = liveDeps()): Promise<Response> {
  const token = tokenFromRequest(req);
  const url = new URL(req.url);
  if (req.method === 'GET' && !url.searchParams.get('sessionId')) {
    if (deps.access === 'hosted' || deps.access === 'closed' || deps.access === 'fixture') {
      return json({ mode: deps.access });
    }
    const probed = await deps.auth(null);
    return json({ mode: probed.ok ? 'fixture' : probed.status === 401 ? 'fixture' : 'closed' });
  }

  if (req.method === 'POST') {
    let peek: Record<string, unknown> = {};
    try { peek = await req.clone().json(); } catch { peek = {}; }
    if (peek.action === 'fixtureLogin') {
      if (!fixtureOpen()) return fail('Not found.', 404);
      return json({ ok: true, label: 'Local fixture — not production authority' }, 200, {
        'set-cookie': `baileyos_workspace=${FIXTURE_STEWARD}; HttpOnly; SameSite=Lax; Path=/`,
      });
    }
  }

  const auth = await deps.auth(token);
  if (!auth.ok) return fail(auth.error, auth.status);

  if (req.method === 'GET') {
    const session = findSession(deps, url.searchParams.get('sessionId'));
    if (!session) return fail('Session not found.', 404);
    if (!isParticipant(session, auth.actor)) return fail('You are not a participant in this session.', 403);
    return json({ actor: auth.actor, session: publicView(session) });
  }

  if (req.method !== 'POST') return fail('Method not allowed.', 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail('Bad request.', 400); }
  const action = body.action;

  if (action === 'whoami') return json({ actor: auth.actor });

  if (action === 'create') {
    if (auth.actor.role !== 'steward') return fail('Only a steward can open a session.', 403);
    const memberIds = Array.isArray(body.participantIds) ? body.participantIds.filter((item): item is string => typeof item === 'string' && item !== auth.actor.id) : [];
    const session: SharedSession = {
      id: id(),
      participantIds: [auth.actor.id, ...memberIds],
      history: [],
      requests: [],
      outputs: [],
      releases: [],
    };
    deps.sessions.set(session.id, session);
    return json({ actor: auth.actor, session: publicView(session) });
  }

  const session = findSession(deps, body.sessionId);
  if (!session) return fail('Session not found.', 404);
  if (!isParticipant(session, auth.actor)) return fail('You are not a participant in this session.', 403);

  if (action === 'read') return json({ actor: auth.actor, session: publicView(session) });

  if (action === 'note') {
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text || text.length > 4000) return fail('Write a note of 4000 characters or fewer.', 400);
    const entry: HistoryEntry = {
      id: id(),
      kind: auth.actor.role === 'steward' ? 'steward' : 'participant',
      authorId: auth.actor.id,
      text,
    };
    session.history.push(entry);
    return json({ actor: auth.actor, session: publicView(session) });
  }

  if (action === 'handRaise') {
    const provider = body.provider === 'gemini' || body.provider === 'grok' ? body.provider : null;
    const intent = typeof body.intent === 'string' ? body.intent.trim() : '';
    if (!provider) return fail('Choose Gemini or Grok.', 400);
    if (!intent || intent.length > 500) return fail('Say what you want this turn to consider.', 400);
    if (session.requests.some(item => item.status === 'pending' || item.status === 'granted')) {
      return fail('A turn is already waiting. Finish or reject it before asking for another.', 409);
    }
    const request: TurnRequest = {
      id: id(),
      provider,
      intent,
      by: auth.actor.id,
      status: 'pending',
      historyDigest: historyDigest(session.history),
    };
    session.requests.push(request);
    return json({ actor: auth.actor, session: publicView(session), requestId: request.id });
  }

  if (action === 'reject' || action === 'grant' || action === 'release') {
    if (auth.actor.role !== 'steward') return fail('Only a steward can grant, reject, or release.', 403);
  }

  if (action === 'reject') {
    return withLock(deps, session.id, async () => {
      const request = session.requests.find(item => item.id === body.requestId);
      if (!request || request.status !== 'pending') return fail('That turn is not pending.', 409);
      request.status = 'rejected';
      return json({ actor: auth.actor, session: publicView(session) });
    });
  }

  if (action === 'grant') {
    return withLock(deps, session.id, async () => {
      const request = session.requests.find(item => item.id === body.requestId);
      if (!request || request.status !== 'pending') return fail('That turn is not pending.', 409);
      const current = historyDigest(session.history);
      if (body.historyDigest !== request.historyDigest || body.historyDigest !== current) {
        request.status = 'stale';
        return fail('The shared history changed. This grant was not run.', 409);
      }
      request.status = 'granted';
      const history = session.history.map(item => ({ ...item }));
      let reply: { text: string };
      try {
        reply = await deps.provider({ provider: request.provider, history });
      } catch (error) {
        request.status = 'failed';
        const message = error instanceof Error ? error.message : 'Simulated provider failure';
        return fail(message, 502);
      }
      const sealed: ModelOutput = {
        id: id(),
        provider: request.provider,
        text: reply.text,
        historyDigest: current,
        digest: outputDigest({ provider: request.provider, text: reply.text, historyDigest: current }),
      };
      session.outputs.push(sealed);
      session.history.push({
        id: sealed.id,
        kind: 'model',
        authorId: sealed.provider,
        provider: sealed.provider,
        text: sealed.text,
        simulated: true,
      });
      request.status = 'complete';
      request.outputId = sealed.id;
      return json({ actor: auth.actor, session: publicView(session), output: sealed });
    });
  }

  if (action === 'release') {
    return withLock(deps, session.id, async () => {
      const output = session.outputs.find(item => item.id === body.outputId);
      if (!output) return fail('That reply does not exist.', 404);
      if (body.digest !== output.digest) return fail('That approval does not match this reply. It was not released.', 409);
      const existing = session.releases.find(item => item.outputId === output.id);
      if (existing) {
        if (existing.digest !== output.digest) return fail('The approved text no longer matches. It was not released again.', 409);
        return json({ actor: auth.actor, release: existing, alreadyReleased: true });
      }
      const release = { outputId: output.id, digest: output.digest, snapshot: output.text, provider: output.provider };
      session.releases.push(release);
      return json({ actor: auth.actor, release, alreadyReleased: false });
    });
  }

  if (action === 'export') {
    const release = session.releases.find(item => item.outputId === body.outputId);
    if (!release) return fail('That reply has not been approved for export.', 404);
    const output = session.outputs.find(item => item.id === release.outputId);
    if (!output || output.digest !== release.digest) return fail('The approved text changed. This export was refused.', 409);
    return json({
      actor: auth.actor,
      export: { outputId: release.outputId, digest: release.digest, provider: release.provider, text: release.snapshot },
    });
  }

  return fail('Unknown action.', 400);
}
