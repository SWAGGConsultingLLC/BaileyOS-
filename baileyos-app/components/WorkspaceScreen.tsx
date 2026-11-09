'use client';

import { useEffect, useRef, useState } from 'react';
import { browserSupabase } from '@/lib/supabaseBrowser';

type ProviderName = 'gemini' | 'grok';
type Entry = { id: string; kind: string; authorId: string; provider?: string; text: string; simulated?: boolean };
type RequestItem = { id: string; provider: ProviderName; intent: string; by: string; status: string; historyDigest: string; outputId?: string };
type Output = { id: string; provider: ProviderName; text: string; digest: string };
type View = { id: string; history: Entry[]; requests: RequestItem[]; outputs: Output[]; releases: { outputId: string; digest: string }[] };

async function post(action: string, extra: Record<string, unknown>, token: string | null) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch('/api/workspace', {
    method: 'POST',
    credentials: 'same-origin',
    headers,
    body: JSON.stringify({ action, ...extra }),
  });
  const body = await res.json();
  return { ok: res.ok, body };
}

export function WorkspaceScreen() {
  const [mode, setMode] = useState<'loading' | 'closed' | 'fixture' | 'hosted'>('loading');
  const [actorRole, setActorRole] = useState<string>('');
  const [session, setSession] = useState<View | null>(null);
  const [note, setNote] = useState('');
  const [intent, setIntent] = useState('Look at the shared notes and reply.');
  const [message, setMessage] = useState('');
  const [exportText, setExportText] = useState('');
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let body: { mode?: string; actor?: { role: string }; error?: string } = {};
      try {
        body = await fetch('/api/workspace', { credentials: 'same-origin' }).then(r => r.json());
      } catch {
        if (!cancelled) setMode('closed');
        return;
      }
      if (cancelled) return;
      if (body.mode === 'fixture') {
        setMode('fixture');
        return;
      }
      if (body.mode !== 'hosted') {
        setMode('closed');
        return;
      }
      const client = browserSupabase();
      const access = client ? (await client.auth.getSession()).data.session?.access_token ?? null : null;
      if (cancelled) return;
      if (!access) {
        setMode('hosted');
        return;
      }
      tokenRef.current = access;
      const result = await post('whoami', {}, access);
      if (cancelled) return;
      if (!result.ok) tokenRef.current = null;
      if (result.body.actor) setActorRole(result.body.actor.role);
      if (result.body.error) setMessage(result.body.error);
      setMode('hosted');
    })();
    return () => { cancelled = true; };
  }, []);

  function apply(body: { actor?: { role: string }; session?: View; error?: string; export?: { text: string } }) {
    if (body.actor) setActorRole(body.actor.role);
    if (body.session) setSession(body.session);
    if (body.error) setMessage(body.error);
    if (body.export) setExportText(body.export.text);
  }

  async function run(action: string, extra: Record<string, unknown> = {}) {
    setMessage('');
    const result = await post(action, { sessionId: session?.id, ...extra }, tokenRef.current);
    apply(result.body);
  }

  if (mode === 'loading') return <p className="p-6 text-lg">Loading the workspace status.</p>;

  if (mode === 'closed') {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-sm font-bold tracking-wide text-amber-200">Prototype — simulated responses; no live Gemini or Grok connection</p>
        <h1 className="mt-3 text-3xl font-bold">Shared conversation</h1>
        <p className="mt-4 text-lg leading-relaxed text-gray-200">This workspace is closed on this server. A trusted steward check is not configured, so nobody can grant a turn or release text from here.</p>
        <p className="mt-3 text-gray-400">The map on the home page is separate and does not use this screen.</p>
      </main>
    );
  }

  if (mode === 'hosted' && !actorRole) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-sm font-bold tracking-wide text-amber-200">Prototype — simulated responses; no live Gemini or Grok connection</p>
        <h1 className="mt-3 text-3xl font-bold">Shared conversation</h1>
        <p className="mt-4 text-lg leading-relaxed text-gray-200" role="status">{message || 'Sign in on the map, then return to this page. This page does not create an account and does not grant a role.'}</p>
        <a className="mt-6 inline-flex min-h-12 items-center font-semibold text-cyan-300 underline" href="/">Go to the map</a>
      </main>
    );
  }

  const pending = session?.requests.find(item => item.status === 'pending');
  const steward = actorRole === 'steward';

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <p className="text-sm font-bold tracking-wide text-amber-200">Prototype — simulated responses; no live Gemini or Grok connection</p>
      {mode === 'fixture' ? (
        <p className="mt-2 text-sm text-amber-100">Local fixture — not production authority</p>
      ) : (
        <p className="mt-2 text-sm text-amber-100" role="status">{steward ? 'The server sees the steward for this sign-in. Replies stay simulated.' : 'The server sees an ordinary member. This sign-in cannot grant, reject, or release.'}</p>
      )}
      <h1 className="mt-3 text-3xl font-bold">Shared conversation</h1>
      <p className="mt-3 leading-relaxed text-gray-300">A steward decides one turn at a time. Simulated replies can disagree. Agreement is not proof. A reply cannot grant permission.</p>

      {mode === 'fixture' && !actorRole && (
        <button type="button" className="mt-6 min-h-12 w-full rounded-lg bg-cyan-300 px-4 font-semibold text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" onClick={async () => {
          const result = await post('fixtureLogin', {}, null);
          if (result.ok) setActorRole('pending');
          else setMessage(result.body.error || 'This workspace is closed.');
        }}>
          Use local fixture steward
        </button>
      )}

      {mode === 'fixture' && actorRole === 'pending' && (
        <button type="button" className="mt-4 min-h-12 rounded-lg border border-cyan-300 px-4 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" onClick={() => run('create', { participantIds: ['member-1'] })}>
          Start a session with the local member
        </button>
      )}

      {mode === 'hosted' && steward && !session && (
        <button type="button" className="mt-4 min-h-12 rounded-lg border border-cyan-300 px-4 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" onClick={() => run('create', { participantIds: [] })}>
          Start a simulated session
        </button>
      )}

      {session && (
        <section className="mt-6" aria-label="Shared history">
          <h2 className="text-xl font-semibold">History</h2>
          <ol className="mt-3 space-y-3">
            {session.history.length === 0 && <li className="text-gray-400">No messages yet.</li>}
            {session.history.map(item => (
              <li key={item.id} className="rounded-lg border border-gray-700 p-3">
                <p className="text-xs uppercase tracking-wide text-gray-400">{item.kind === 'model' ? `Simulated ${item.provider}` : item.kind}</p>
                <p className="mt-1 whitespace-pre-wrap">{item.text}</p>
              </li>
            ))}
          </ol>

          <label className="mt-6 block text-sm" htmlFor="note">Add a labeled note</label>
          <textarea id="note" value={note} onChange={e => setNote(e.target.value)} className="mt-2 min-h-24 w-full rounded-lg border border-gray-600 bg-transparent p-3" />
          <button type="button" className="mt-2 min-h-12 rounded-lg bg-white px-4 font-semibold text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300" onClick={() => { const text = note; setNote(''); return run('note', { text }); }}>
            Add note
          </button>

          <h2 className="mt-8 text-xl font-semibold">Ask for one turn</h2>
          <label className="mt-2 block text-sm" htmlFor="intent">What should this turn consider?</label>
          <input id="intent" value={intent} onChange={e => setIntent(e.target.value)} className="mt-2 w-full rounded-lg border border-gray-600 bg-transparent p-3" />
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <button type="button" className="min-h-12 flex-1 rounded-lg border border-cyan-300 px-4 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" onClick={() => run('handRaise', { provider: 'gemini', intent })}>Ask for a Gemini turn</button>
            <button type="button" className="min-h-12 flex-1 rounded-lg border border-cyan-300 px-4 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" onClick={() => run('handRaise', { provider: 'grok', intent })}>Ask for a Grok turn</button>
          </div>

          {pending && (
            <div className="mt-4 rounded-lg border border-amber-200/40 p-3" aria-live="polite">
              <p>Waiting for a steward. {pending.provider} has not been asked yet.</p>
              <p className="mt-1 text-sm text-gray-300">{pending.intent}</p>
              {steward && (
                <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                  <button type="button" className="min-h-12 rounded-lg bg-cyan-300 px-4 font-semibold text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" onClick={() => run('grant', { requestId: pending.id, historyDigest: pending.historyDigest })}>Grant this turn</button>
                  <button type="button" className="min-h-12 rounded-lg border border-gray-500 px-4 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" onClick={() => run('reject', { requestId: pending.id })}>Reject this turn</button>
                </div>
              )}
            </div>
          )}

          <h2 className="mt-8 text-xl font-semibold">Release an exact reply</h2>
          <ul className="mt-3 space-y-3">
            {session.outputs.map(output => (
              <li key={output.id} className="rounded-lg border border-gray-700 p-3">
                <p className="text-xs uppercase tracking-wide text-gray-400">Simulated {output.provider}</p>
                <p className="mt-1 whitespace-pre-wrap">{output.text}</p>
                {steward && <button type="button" className="mt-3 min-h-12 rounded-lg border border-amber-200 px-4 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" onClick={() => run('release', { outputId: output.id, digest: output.digest })}>Approve this exact text</button>}
                <button type="button" className="mt-3 min-h-12 rounded-lg border border-gray-500 px-4 font-semibold sm:ml-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" onClick={() => run('export', { outputId: output.id })}>Retrieve the approved text</button>
              </li>
            ))}
          </ul>
          {exportText && (
            <pre className="mt-4 whitespace-pre-wrap rounded-lg bg-black p-3 text-sm" aria-label="Approved export">{exportText}</pre>
          )}
        </section>
      )}
      {message && <p className="mt-4 text-amber-100" role="status">{message}</p>}
    </main>
  );
}
