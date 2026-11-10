'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { BrewLogo } from '@/components/BrewLogo';
import { suiteStatusText } from '@/lib/steward/decide';
import { SUITE_LINKEDIN_PROVIDER, SUITE_SCOPES, suiteAuthorizeHref, suiteConfig, suiteEnabled } from '@/lib/suite/verify';

export type SuiteContinuePhase =
  | { state: 'hidden' }
  | { state: 'preparing' }
  | { state: 'ready'; href: string }
  | { state: 'error'; message: string };

export function SuiteBadge({ status }: { status: { recorded: boolean; steward: boolean } | null }) {
  const text = suiteStatusText(status);
  if (!text) return null;
  return <p className="mt-2 text-sm font-semibold text-amber-100" role="status">{text}</p>;
}

export function suiteContinueLabel(href: string): string {
  if (href === '/steward') return 'Open the Steward Consensus Report';
  if (href === '/brewing') return 'Open 360° Brewing';
  return 'Continue to 360° Brewing';
}

export function SuiteContinue({ phase, status = null }: { phase: SuiteContinuePhase; status?: { recorded: boolean; steward: boolean } | null }) {
  if (phase.state === 'hidden' && !status) return null;
  const signedIn = status?.recorded === true;
  return (
    <section className="mt-6 rounded-2xl border border-gray-800 p-4" aria-labelledby="suite-heading">
      <BrewLogo size={64} />
      <h2 id="suite-heading" className="mt-3 text-sm font-bold tracking-widest text-gray-400">360° BREWING</h2>
      <SuiteBadge status={status} />
      <p className="mt-2 text-sm text-gray-300">{signedIn
        ? 'You are signed in to 360° Brewing on this map.'
        : 'Continue to 360° Brewing to sign in with LinkedIn. The link leaves this map and returns here. Do not choose Sign up. The email account on this page stays separate.'}</p>
      {phase.state === 'preparing' && <p className="mt-4 text-sm text-gray-200" role="status">Preparing the 360° Brewing sign-in…</p>}
      {phase.state === 'error' && <p className="mt-4 text-sm text-amber-100" role="alert">{phase.message}</p>}
      {phase.state === 'ready' && (
        <a href={phase.href} className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-white px-4 text-center font-semibold text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300">
          {suiteContinueLabel(phase.href)}
        </a>
      )}
      {signedIn && <a className="mt-3 inline-flex min-h-12 items-center font-semibold text-cyan-300 underline" href="/brew/q/001">Question #001</a>}
    </section>
  );
}

type PrepareResult = { href: string } | { error: string };

/** Builds the authorize address and stores the return check before the tap. */
export async function prepareSuiteHref(redirectTo: string): Promise<PrepareResult> {
  const config = suiteConfig();
  if (!config) return { error: '360° Brewing sign-in is not turned on for this map.' };
  try {
    const client = createClient(config.url, config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, flowType: 'pkce' },
    });
    const startOAuth = client.auth.signInWithOAuth.bind(client.auth) as (credentials: {
      provider: 'linkedin_oidc';
      options?: { redirectTo?: string; scopes?: string; skipBrowserRedirect?: boolean };
    }) => Promise<{ data?: { url?: string | null }; error?: { message?: string } | null }>;
    const result = await startOAuth({
      provider: SUITE_LINKEDIN_PROVIDER,
      options: { redirectTo, scopes: SUITE_SCOPES, skipBrowserRedirect: true },
    });
    const href = result.data?.url ? suiteAuthorizeHref(result.data.url, config) : null;
    if (result.error || !href) return { error: 'Could not prepare the 360° Brewing sign-in.' };
    return { href };
  } catch {
    return { error: 'Could not prepare the 360° Brewing sign-in.' };
  }
}

/**
 * The continue control is a real link, prepared before the tap.
 * A scripted redirect after a delay is dropped by some phone browsers.
 */
export function SuiteEntrance({
  prepare = prepareSuiteHref,
  onSignedIn,
}: {
  prepare?: (redirectTo: string) => Promise<PrepareResult>;
  onSignedIn?: (signedIn: boolean) => void;
}) {
  const [phase, setPhase] = useState<SuiteContinuePhase>({ state: 'hidden' });
  const [status, setStatus] = useState<{ recorded: boolean; steward: boolean } | null>(null);

  useEffect(() => {
    if (!suiteEnabled()) return;
    const config = suiteConfig();
    if (!config) return;
    let cancel = false;
    const client = createClient(config.url, config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce' },
    });
    client.auth.getSession().then(async ({ data }) => {
      const token = data.session?.access_token;
      if (!token || cancel) return;
      const res = await fetch('/api/suite', { method: 'POST', headers: { authorization: `Bearer ${token}` } });
      const body = await res.json().catch(() => ({}));
      if (cancel || !res.ok || typeof body.subject !== 'string') return;
      const next = { recorded: body.recorded === true, steward: body.steward === true };
      setStatus(next);
      if (next.recorded) onSignedIn?.(true);
    }).catch(() => undefined);
    return () => { cancel = true; };
  }, [onSignedIn]);

  useEffect(() => {
    if (!suiteEnabled()) return;
    if (status?.recorded) {
      setPhase({ state: 'ready', href: status.steward ? '/steward' : '/brewing' });
      return;
    }
    let cancel = false;
    setPhase({ state: 'preparing' });
    const redirectTo = window.location.origin + '/suite';
    prepare(redirectTo).then(result => {
      if (cancel) return;
      if ('href' in result) setPhase({ state: 'ready', href: result.href });
      else setPhase({ state: 'error', message: result.error });
    }).catch(() => {
      if (!cancel) setPhase({ state: 'error', message: 'Could not prepare the 360° Brewing sign-in.' });
    });
    return () => { cancel = true; };
  }, [prepare, status]);

  return <SuiteContinue phase={phase} status={status} />;
}
