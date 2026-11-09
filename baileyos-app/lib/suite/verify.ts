/** 360° Brewing Auth issuer. Verified from that project's public discovery document. */
export const SUITE_ISSUER = 'https://shedpnosbkwkmwgqkefj.supabase.co/auth/v1';
/** Current Data Nest provider. It sends LinkedIn a PKCE challenge. */
export const SUITE_PROVIDER = 'custom:app-oidc';
/** Built-in Supabase provider. It does not send LinkedIn a PKCE challenge. */
export const SUITE_LINKEDIN_PROVIDER = 'linkedin_oidc';
const SUITE_PROVIDERS = [SUITE_PROVIDER, SUITE_LINKEDIN_PROVIDER] as const;
export type SuiteProviderName = (typeof SUITE_PROVIDERS)[number];

const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SuiteConfig = { url: string; publishableKey: string };
export type VerifiedSuiteUser = { id?: unknown };

export type SuiteDecision =
  | { ok: true; subject: string }
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

/** Off unless the public suite URL is exactly the 360 project and a publishable key is present. */
export function suiteConfig(env: {
  suiteUrl?: string;
  suiteKey?: string;
} = {}): SuiteConfig | null {
  const url = (env.suiteUrl ?? process.env.NEXT_PUBLIC_SUITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
  const publishableKey = (env.suiteKey ?? process.env.NEXT_PUBLIC_SUITE_PUBLISHABLE_KEY ?? '').trim();
  if (!url || !publishableKey) return null;
  if (issuerFor(url) !== SUITE_ISSUER) return null;
  return { url, publishableKey };
}

export function suiteEnabled(env?: { suiteUrl?: string; suiteKey?: string }): boolean {
  return suiteConfig(env) !== null;
}

/** Stays on the custom provider until LinkedIn (OIDC) is enabled and this is set to linkedin_oidc. */
export function suiteProvider(env: { suiteProvider?: string } = {}): SuiteProviderName {
  const requested = (env.suiteProvider ?? process.env.NEXT_PUBLIC_SUITE_PROVIDER ?? '').trim();
  return (SUITE_PROVIDERS as readonly string[]).includes(requested) ? requested as SuiteProviderName : SUITE_PROVIDER;
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
    const missing = /verifier|code challenge|pkce/i.test(input.exchangeError);
    if (missing) {
      return {
        kind: 'error',
        message: 'The return reached this page, but this browser does not have the sign-in check saved on the map. LinkedIn often opens its own browser. Open the map in Safari or Chrome, clear this site’s data if a previous try stuck, tap Continue, and stay in that same browser.',
      };
    }
    return {
      kind: 'error',
      message: 'The return reached this page, but the sign-in could not be finished. Open the map in the phone’s main browser and tap Continue again.',
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

/** Accept only an authorize URL on the configured 360 project. */
export function suiteAuthorizeHref(candidate: string, config: SuiteConfig): string | null {
  try {
    const target = new URL(candidate);
    const allowed = new URL(config.url);
    if (target.origin !== allowed.origin) return null;
    if (target.pathname !== '/auth/v1/authorize') return null;
    const provider = target.searchParams.get('provider');
    if (provider !== SUITE_PROVIDER && provider !== SUITE_LINKEDIN_PROVIDER) return null;
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

/**
 * The subject is the id returned by the 360 Auth server.
 * Email, user_metadata, and app_metadata are ignored. This id is not a map-database auth.uid().
 */
export function decideSuiteSubject(token: string, verifiedUser: VerifiedSuiteUser | null): SuiteDecision {
  const claims = unverifiedClaims(token);
  if (!claims || claims.iss !== SUITE_ISSUER || claims.aud !== 'authenticated' || claims.role === 'service_role') {
    return { ok: false, status: 401, error: 'Sign-in required.' };
  }
  if (!verifiedUser || typeof verifiedUser.id !== 'string' || !USER_ID.test(verifiedUser.id) || claims.sub !== verifiedUser.id) {
    return { ok: false, status: 401, error: 'Sign-in required.' };
  }
  return { ok: true, subject: verifiedUser.id };
}
