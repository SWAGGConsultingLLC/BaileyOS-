/** Shared account rules. Authorization decisions stay in Postgres RLS, not in this file. */

export const DISPLAY_NAME_MAX = 80;
export const BIO_MAX = 280;
export const PASSWORD_MIN = 8;

export type AuthErrorLike = { message?: string; code?: string; status?: number } | null;

export type AuthNotice =
  | { kind: 'confirm-email' }
  | { kind: 'resend-accepted' }
  | { kind: 'profile-saved' }
  | { kind: 'signed-in' }
  | { kind: 'unconfirmed' }
  | { kind: 'invalid' }
  | { kind: 'recovery-sent' }
  | { kind: 'link-sent' }
  | { kind: 'expired' }
  | { kind: 'password-updated' }
  | { kind: 'error'; message: string };

const CONTROL = /[\u0000-\u001F\u007F]/;

export function validateDisplayName(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const value = raw.trim();
  if (!value) return { ok: false, error: 'Enter a display name.' };
  if (value.length > DISPLAY_NAME_MAX) return { ok: false, error: `Display name must be ${DISPLAY_NAME_MAX} characters or fewer.` };
  if (CONTROL.test(value)) return { ok: false, error: 'Display name cannot include control characters.' };
  return { ok: true, value };
}

export function validateBio(raw: string): { ok: true; value: string | null } | { ok: false; error: string } {
  const value = raw.trim();
  if (!value) return { ok: true, value: null };
  if (value.length > BIO_MAX) return { ok: false, error: `Bio must be ${BIO_MAX} characters or fewer.` };
  if (CONTROL.test(value)) return { ok: false, error: 'Bio cannot include control characters.' };
  return { ok: true, value };
}

export function validatePassword(raw: string): { ok: true } | { ok: false; error: string } {
  if (raw.length < PASSWORD_MIN) return { ok: false, error: `Use at least ${PASSWORD_MIN} characters.` };
  if (CONTROL.test(raw)) return { ok: false, error: 'Password cannot include control characters.' };
  return { ok: true };
}

/** Same-origin only. Paths, queries, and non-http schemes are discarded so this cannot be an open redirect. */
export function authRedirectUrl(origin: string): string {
  const url = new URL(origin);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Redirect must be http or https');
  return url.origin;
}

const AUTH_PARAMS = ['access_token', 'refresh_token', 'expires_in', 'expires_at', 'token_type', 'type', 'code', 'provider_token', 'provider_refresh_token'];

function authParams(href: string): { hash: URLSearchParams; query: URLSearchParams } | null {
  try {
    const url = new URL(href);
    return {
      hash: new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash),
      query: url.searchParams,
    };
  } catch {
    return null;
  }
}

function param(parts: { hash: URLSearchParams; query: URLSearchParams }, key: string): string | null {
  return parts.hash.get(key) || parts.query.get(key);
}

/** A recovery callback must carry a token or code. A bare ?type=recovery is not one. */
export function hasRecoveryCredential(href: string): boolean {
  const parts = authParams(href);
  if (!parts || param(parts, 'type') !== 'recovery') return false;
  return Boolean(param(parts, 'access_token') || param(parts, 'refresh_token') || param(parts, 'code'));
}

/** Implicit-flow email links put type in the hash. PKCE links use the query string. */
export function callbackKind(href: string): 'recovery' | 'signup' | null {
  const parts = authParams(href);
  if (!parts) return null;
  const type = param(parts, 'type');
  if (type === 'recovery') return hasRecoveryCredential(href) ? 'recovery' : null;
  if (type === 'signup' || type === 'email') return 'signup';
  return null;
}

/** Drop tokens from the address bar after they have been read. Fragments are not a place to leave a session. */
export function stripAuthParams(href: string): string {
  const url = new URL(href);
  for (const key of AUTH_PARAMS) url.searchParams.delete(key);
  const hash = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash);
  if (AUTH_PARAMS.some(key => hash.has(key))) url.hash = '';
  const search = url.searchParams.toString();
  return url.origin + url.pathname + (search ? `?${search}` : '') + url.hash;
}

export function emailIsConfirmed(emailConfirmedAt: string | null | undefined): boolean {
  return typeof emailConfirmedAt === 'string' && emailConfirmedAt.length > 0;
}

export function sessionIsUsable(
  session: { access_token?: string; expires_at?: number } | null | undefined,
  nowSec: number
): boolean {
  if (!session?.access_token) return false;
  if (typeof session.expires_at === 'number' && session.expires_at <= nowSec) return false;
  return true;
}

export function interpretSignUp(result: {
  error: AuthErrorLike;
  session: unknown | null;
  emailConfirmedAt?: string | null;
  identities?: unknown[] | null;
}): AuthNotice {
  if (result.error) return { kind: 'error', message: 'Could not create the account. If you already have one, sign in.' };
  if (result.session && emailIsConfirmed(result.emailConfirmedAt)) return { kind: 'signed-in' };
  // An empty identity list is the provider's generic success for an address it will not email.
  // Treat it like any other confirmation step: do not say whether the address exists, and do not say a message was delivered.
  return { kind: 'confirm-email' };
}

const ENUMERATION = /already been registered|already registered|already confirmed|email address has already|user already exists/i;

/** Resend success is not delivery. Existence errors stay generic. Rate limits stay specific. */
export function interpretResend(result: { error: AuthErrorLike }): AuthNotice {
  if (!result.error) return { kind: 'resend-accepted' };
  const code = (result.error.code || '').toLowerCase();
  const message = result.error.message || '';
  const lower = message.toLowerCase();
  if (code === 'email_exists' || code === 'user_already_exists' || ENUMERATION.test(message)) return { kind: 'resend-accepted' };
  if (code.includes('rate_limit') || result.error.status === 429 || lower.includes('rate limit') || lower.includes('once every')) {
    const detail = message && !/token|bearer|jwt/i.test(message) ? message : 'Confirmation messages are temporarily limited.';
    return { kind: 'error', message: `Confirmation messages are limited. ${detail}` };
  }
  if (message && message.length <= 180 && !/token|bearer|jwt|password/i.test(message)) return { kind: 'error', message };
  return { kind: 'error', message: 'Could not resend the confirmation message.' };
}

export function interpretSignIn(result: { error: AuthErrorLike; session: unknown | null; emailConfirmedAt?: string | null }): AuthNotice {
  if (!result.error && result.session && emailIsConfirmed(result.emailConfirmedAt)) return { kind: 'signed-in' };
  if (!result.error && result.session) return { kind: 'unconfirmed' };
  if (!result.error) return { kind: 'error', message: 'Sign-in did not start a session.' };
  const code = result.error.code || '';
  const message = (result.error.message || '').toLowerCase();
  if (code === 'email_not_confirmed' || message.includes('email not confirmed')) return { kind: 'unconfirmed' };
  if (code === 'invalid_credentials' || message.includes('invalid login') || message.includes('invalid credentials')) return { kind: 'invalid' };
  return { kind: 'error', message: 'Sign-in failed.' };
}

export function interpretRecoverySend(result: { error: AuthErrorLike }): AuthNotice {
  if (result.error) return { kind: 'error', message: 'Could not send a recovery message.' };
  return { kind: 'recovery-sent' };
}

export function interpretMagicLink(result: { error: AuthErrorLike }): AuthNotice {
  if (result.error) return { kind: 'error', message: 'Could not send a sign-in link. Create an account if you do not have one.' };
  return { kind: 'link-sent' };
}

export type MemberSession = {
  access_token?: string;
  expires_at?: number;
  user?: { id?: string; email_confirmed_at?: string | null };
} | null;

export type SessionDecision = {
  exposeToken: string | null;
  userId: string | null;
  resetPassword: boolean;
  dropUnconfirmed: boolean;
};

/**
 * A recovery session may set a new password and nothing else.
 * A normal session is not turned into recovery by a bare ?type=recovery link.
 * An unconfirmed email does not become a member session.
 */
export function decideSessionExposure(input: {
  event: string | null;
  recoveryPending: boolean;
  session: MemberSession;
  nowSec: number;
}): SessionDecision {
  const session = input.session;
  const usable = sessionIsUsable(session, input.nowSec);
  if (!usable || !session?.access_token || !session.user?.id) {
    return { exposeToken: null, userId: null, resetPassword: false, dropUnconfirmed: false };
  }
  if (!emailIsConfirmed(session.user.email_confirmed_at)) {
    return { exposeToken: null, userId: null, resetPassword: false, dropUnconfirmed: true };
  }
  if (input.event === 'PASSWORD_RECOVERY' || input.recoveryPending) {
    return { exposeToken: null, userId: session.user.id, resetPassword: true, dropUnconfirmed: false };
  }
  return { exposeToken: session.access_token, userId: session.user.id, resetPassword: false, dropUnconfirmed: false };
}

export function noticeText(notice: AuthNotice): string {
  switch (notice.kind) {
    case 'confirm-email':
      return 'Step 2 of 3. Check the inbox for this address, including spam and other folders. Open a confirmation message before signing in. If you already use this address, sign in or reset the password. This response does not by itself mean a new message was delivered.';
    case 'resend-accepted':
      return 'The resend request was accepted. Check the inbox if this address still needs confirmation. This does not confirm that a new message was delivered.';
    case 'profile-saved':
      return 'Private profile saved on this email account. This account is not Steward.';
    case 'signed-in':
      return 'Signed in with email. This account is not Steward. Saving a profile does not attach a map placement.';
    case 'unconfirmed':
      return 'This email is not confirmed yet. Open the confirmation message, then sign in. Placement on the map is separate.';
    case 'invalid':
      return 'Email or password was not accepted.';
    case 'recovery-sent':
      return 'If an account exists for that email, a recovery link is on its way. Open it in this browser, then choose a new password.';
    case 'link-sent':
      return 'If that account already exists, a sign-in link is on its way. The link does not create a member and does not attach a map placement.';
    case 'expired':
      return 'Your session expired. Sign in again.';
    case 'password-updated':
      return 'Password updated.';
    case 'error':
      return notice.message;
  }
}
