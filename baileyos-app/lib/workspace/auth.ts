import type { Actor } from './types';

export type AuthResult = { ok: true; actor: Actor } | { ok: false; status: number; error: string };
export type Authenticator = (token: string | null) => AuthResult | Promise<AuthResult>;

export const FIXTURE_STEWARD = 'local-fixture-steward';
export const FIXTURE_MEMBER = 'local-fixture-member';
export const FIXTURE_OUTSIDER = 'local-fixture-outsider';

export function closedAuthenticator(): Authenticator {
  return () => ({ ok: false, status: 403, error: 'Steward checks are not configured. This workspace is closed.' });
}

export function fixtureAuthenticator(directory: Map<string, Actor>): Authenticator {
  return token => {
    if (!token) return { ok: false, status: 401, error: 'Sign-in required.' };
    const actor = directory.get(token);
    if (!actor) return { ok: false, status: 401, error: 'Sign-in required.' };
    return { ok: true, actor };
  };
}

export function defaultFixtureDirectory(): Map<string, Actor> {
  return new Map<string, Actor>([
    [FIXTURE_STEWARD, { id: 'steward-1', role: 'steward' }],
    [FIXTURE_MEMBER, { id: 'member-1', role: 'member' }],
    [FIXTURE_OUTSIDER, { id: 'outsider-1', role: 'member' }],
  ]);
}

/** Production never accepts the local fixture, even if the env var is set. */
export function authenticatorFor(env: { nodeEnv?: string; sessionAuth?: string } = {}): Authenticator {
  const nodeEnv = env.nodeEnv ?? process.env.NODE_ENV;
  const sessionAuth = env.sessionAuth ?? process.env.BAILEYOS_SESSION_AUTH;
  if (nodeEnv === 'production' || sessionAuth !== 'fixture') return closedAuthenticator();
  return fixtureAuthenticator(defaultFixtureDirectory());
}

export function tokenFromRequest(req: Request): string | null {
  const header = req.headers.get('authorization');
  if (header) return header.replace(/^Bearer\s+/i, '').trim() || null;
  const cookie = req.headers.get('cookie') || '';
  const match = cookie.match(/(?:^|;\s*)baileyos_workspace=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}
