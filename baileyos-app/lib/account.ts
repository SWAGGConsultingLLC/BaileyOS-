/** Shared account rules. Authorization decisions stay in Postgres RLS, not in this file. */

export const DISPLAY_NAME_MAX = 80;
export const BIO_MAX = 280;
export const PASSWORD_MIN = 8;

export type AuthErrorLike = { message?: string; code?: string; status?: number } | null;

export type AuthNotice =
  | { kind: 'confirm-email' }
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

export function authRedirectUrl(origin: string): string {
  return origin.replace(/\/$/, '');
}

/** Implicit-flow email links put type in the hash. PKCE links use the query string. */
export function callbackKind(href: string): 'recovery' | 'signup' | null {
  let url: URL;
  try { url = new URL(href); } catch { return null; }
  const hash = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash);
  const type = hash.get('type') || url.searchParams.get('type');
  if (type === 'recovery') return 'recovery';
  if (type === 'signup' || type === 'email') return 'signup';
  return null;
}

export function sessionIsUsable(
  session: { access_token?: string; expires_at?: number } | null | undefined,
  nowSec: number
): boolean {
  if (!session?.access_token) return false;
  if (typeof session.expires_at === 'number' && session.expires_at <= nowSec) return false;
  return true;
}

export function interpretSignUp(result: { error: AuthErrorLike; session: unknown | null }): AuthNotice {
  if (result.error) return { kind: 'error', message: 'Could not create the account. If you already have one, sign in.' };
  if (result.session) return { kind: 'signed-in' };
  return { kind: 'confirm-email' };
}

export function interpretSignIn(result: { error: AuthErrorLike; session: unknown | null }): AuthNotice {
  if (!result.error && result.session) return { kind: 'signed-in' };
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

export function noticeText(notice: AuthNotice): string {
  switch (notice.kind) {
    case 'confirm-email':
      return 'Check your email and open the confirmation link before signing in. An unconfirmed signup is not a signed-in member. The link does not place you on the map.';
    case 'signed-in':
      return 'Signed in. Your profile is private. Saving it does not attach a map placement.';
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
