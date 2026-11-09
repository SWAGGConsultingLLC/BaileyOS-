export type VerifiedIdentity = {
  userId: string;
  emailConfirmedAt: string | null;
};

export type GrantState = 'active' | 'absent' | 'unavailable';

export type IdentityResult =
  | { ok: true; identity: VerifiedIdentity }
  | { ok: false; status: 401 | 403; error: string };

export type RoleDecision =
  | { ok: true; actor: { id: string; role: 'steward' | 'member' } }
  | { ok: false; status: 401 | 403; error: string };

const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Copies the Auth user id and confirmation time only. Email and metadata are dropped. */
export function identityFromAuthUser(user: unknown): VerifiedIdentity | null {
  if (!user || typeof user !== 'object') return null;
  const record = user as Record<string, unknown>;
  if (typeof record.id !== 'string') return null;
  const confirmed = typeof record.email_confirmed_at === 'string' ? record.email_confirmed_at.trim() : '';
  return { userId: record.id, emailConfirmedAt: confirmed || null };
}

/**
 * Role comes from the server grant table, not from the request and not from the JWT.
 * An unconfirmed user is rejected even when a grant row exists.
 * A missing table or a failed lookup closes the workspace instead of treating everyone as a member.
 */
export function decideRole(identity: VerifiedIdentity | null, grant: GrantState): RoleDecision {
  if (!identity || !USER_ID.test(identity.userId)) {
    return { ok: false, status: 401, error: 'Sign-in required.' };
  }
  if (!identity.emailConfirmedAt || !identity.emailConfirmedAt.trim()) {
    return { ok: false, status: 403, error: 'Confirm your email before continuing.' };
  }
  if (grant === 'unavailable') {
    return { ok: false, status: 403, error: 'Steward checks are not configured. This workspace is closed.' };
  }
  return {
    ok: true,
    actor: { id: identity.userId, role: grant === 'active' ? 'steward' : 'member' },
  };
}
