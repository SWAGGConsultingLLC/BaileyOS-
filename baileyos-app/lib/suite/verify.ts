/** Map project. LinkedIn (OIDC) sessions for 360° Brewing are issued here. */
export const SUITE_ISSUER = 'https://rxckxwdvhjszzuqsvxdk.supabase.co/auth/v1';
/** Built-in provider. It does not send a PKCE proof to LinkedIn. */
export const SUITE_LINKEDIN_PROVIDER = 'linkedin_oidc';
/** Data Nest custom provider. It stays in code and is not used by the button. */
export const SUITE_PROVIDER = 'custom:app-oidc';
export const SUITE_SCOPES = 'openid profile email';

const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROVIDER_SUB = /^[A-Za-z0-9._-]{1,255}$/;

export type SuiteConfig = { url: string; publishableKey: string };
export type VerifiedSuiteUser = {
  id?: unknown;
  identities?: { provider?: unknown; identity_data?: unknown }[] | null;
};

export type SuiteDecision =
  | { ok: true; subject: string; providerSub: string }
  | { ok: false; status: 401; error: string };

function issuerFor(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return null;
    return parsed.origin + '/auth/v1';
  } catch {
    return null;
  }
}

/** On when the map project URL and its publishable key are present. The Data Nest project is not accepted. */
export function suiteConfig(env: {
  suiteUrl?: string;
  suiteKey?: string;
} = {}): SuiteConfig | null {
  const url = (env.suiteUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
  const publishableKey = (env.suiteKey ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
  if (!url || !publishableKey) return null;
  if (issuerFor(url) !== SUITE_ISSUER) return null;
  return { url, publishableKey };
}

export function suiteEnabled(env?: { suiteUrl?: string; suiteKey?: string }): boolean {
  return suiteConfig(env) !== null;
}

export type SuiteCallback =
  | { kind: 'pending'; message: string }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; message: string };

function safeProviderText(value: string): string {
  const cleaned = value.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '').trim();
  return cleaned.slice(0, 160);
}

/**
 * Explains a /suite return without contacting Auth.
 * A code with a missing verifier means the return browser is not the one that started the link.
 */
export function suiteCallbackMessage(input: {
  search: string;
  exchangeError?: string | null;
  hasSession: boolean;
}): SuiteCallback {
  const query = new URLSearchParams(input.search.startsWith('?') ? input.search.slice(1) : input.search);
  const providerError = query.get('error_description') || query.get('error');
  if (providerError) {
    return {
      kind: 'error',
      message: `360° Brewing did not finish the sign-in. ${safeProviderText(providerError)}`,
    };
  }
  if (query.get('code') && input.exchangeError) {
    const mismatch = /does not match|bad_code_verifier|code challenge/i.test(input.exchangeError);
    const missing = /not found|verifier not/i.test(input.exchangeError);
    if (mismatch) {
      return {
        kind: 'error',
        message: 'The sign-in was started more than once, so the return could not be finished. Go back to the map and tap the LinkedIn button once.',
      };
    }
    if (missing) {
      return {
        kind: 'error',
        message: 'The return reached this page, but this browser does not have the sign-in check saved on the map. LinkedIn often opens its own browser. Open the map in Safari or Chrome, clear this site’s data if a previous try stuck, tap Continue, and stay in that same browser.',
      };
    }
    return {
      kind: 'error',
      message: 'The return reached this page, but the sign-in could not be finished. Go back to the map and tap the LinkedIn button once.',
    };
  }
  if (!input.hasSession) {
    return {
      kind: 'pending',
      message: '360° Brewing has not confirmed a sign-in on this map yet. A sign-in kept on the 360 website does not count here. Tap Continue on the map and choose Sign in with LinkedIn or Sign in.',
    };
  }
  return { kind: 'ready', message: '' };
}

/** A PKCE code that landed on the map root belongs on /suite. An email link uses the hash instead. */
export function suiteReturnTarget(href: string): string | null {
  let url: URL;
  try { url = new URL(href); } catch { return null; }
  if (url.pathname === '/suite') return null;
  if (!url.searchParams.get('code')) return null;
  if (url.hash.includes('access_token')) return null;
  return `/suite${url.search}`;
}

/** Accept only a LinkedIn (OIDC) authorize URL on the map project that returns to /suite. */
export function suiteAuthorizeHref(candidate: string, config: SuiteConfig): string | null {
  try {
    const target = new URL(candidate);
    const allowed = new URL(config.url);
    if (target.origin !== allowed.origin) return null;
    if (target.pathname !== '/auth/v1/authorize') return null;
    if (target.searchParams.get('provider') !== SUITE_LINKEDIN_PROVIDER) return null;
    const redirectTo = target.searchParams.get('redirect_to');
    if (!redirectTo) return null;
    const back = new URL(redirectTo);
    if (back.pathname !== '/suite') return null;
    return target.toString();
  } catch {
    return null;
  }
}

/** Reads claims without checking the signature. Authorization still requires the Auth server result. */
export function unverifiedClaims(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const json = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const value = JSON.parse(json);
    return value && typeof value === 'object' ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function linkedInSub(user: VerifiedSuiteUser): string | null {
  const identities = Array.isArray(user.identities) ? user.identities : [];
  const linked = identities.filter(item => item?.provider === SUITE_LINKEDIN_PROVIDER);
  if (linked.length !== 1) return null;
  const data = linked[0].identity_data;
  if (!data || typeof data !== 'object') return null;
  const sub = (data as { sub?: unknown }).sub;
  return typeof sub === 'string' && PROVIDER_SUB.test(sub) ? sub : null;
}

/**
 * The subject is the map auth user id returned by this project's Auth server.
 * The provider subject is that server's LinkedIn identity sub.
 * Email, user_metadata, and app_metadata are ignored.
 */
export function decideSuiteSubject(token: string, verifiedUser: VerifiedSuiteUser | null): SuiteDecision {
  const claims = unverifiedClaims(token);
  if (!claims || claims.iss !== SUITE_ISSUER || claims.aud !== 'authenticated' || claims.role === 'service_role') {
    return { ok: false, status: 401, error: 'Sign-in required.' };
  }
  if (!verifiedUser || typeof verifiedUser.id !== 'string' || !USER_ID.test(verifiedUser.id) || claims.sub !== verifiedUser.id) {
    return { ok: false, status: 401, error: 'Sign-in required.' };
  }
  const providerSub = linkedInSub(verifiedUser);
  if (!providerSub) return { ok: false, status: 401, error: 'Sign-in required.' };
  return { ok: true, subject: verifiedUser.id, providerSub };
}
