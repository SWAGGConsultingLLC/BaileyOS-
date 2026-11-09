'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { suiteStatusText } from '@/lib/steward/decide';
import { SUITE_PROVIDER, suiteAuthorizeHref, suiteConfig, suiteEnabled } from '@/lib/suite/verify';

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

export function SuiteContinue({ phase, status = null }: { phase: SuiteContinuePhase; status?: { recorded: boolean; steward: boolean } | null }) {
  if (phase.state === 'hidden' && !status) return null;
  return (
    <section className="mt-6 rounded-2xl border border-gray-800 p-4" aria-labelledby="suite-heading">
      <h2 id="suite-heading" className="text-sm font-bold tracking-widest text-gray-400">360° BREWING</h2>
      <SuiteBadge status={status} />
      <p className="mt-2 text-sm text-gray-300">Continue to 360° Brewing to sign in. On the next screen choose Sign in with LinkedIn or Sign in. Do not choose Sign up. The link leaves this map and returns to this site. The yellow desk link below stays on this map.</p>
      {phase.state === 'preparing' && <p className="mt-4 text-sm text-gray-200" role="status">Preparing the 360° Brewing sign-in…</p>}
      {phase.state === 'error' && <p className="mt-4 text-sm text-amber-100" role="alert">{phase.message}</p>}
      {phase.state === 'ready' && (
        <a href={phase.href} className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-white px-4 text-center font-semibold text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300">
          Continue to 360° Brewing
        </a>
      )}
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
      provider: string;
      options?: { redirectTo?: string; skipBrowserRedirect?: boolean };
    }) => Promise<{ data?: { url?: string | null }; error?: { message?: string } | null }>;
    const result = await startOAuth({
      provider: SUITE_PROVIDER,
      options: { redirectTo, skipBrowserRedirect: true },
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
  }, [prepare]);

  return <SuiteContinue phase={phase} status={status} />;
}
