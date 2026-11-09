/** 360° Brewing Auth issuer. Verified from that project's public discovery document. */
export const SUITE_ISSUER = 'https://shedpnosbkwkmwgqkefj.supabase.co/auth/v1';
export const SUITE_PROVIDER = 'custom:app-oidc';

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
