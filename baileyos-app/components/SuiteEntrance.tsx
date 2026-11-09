'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { SUITE_PROVIDER, suiteEnabled } from '@/lib/suite/verify';

/**
 * Hidden unless the 360 project URL and publishable key are configured.
 * The button leaves this origin for that project's sign-in and returns to /suite.
 */
export function SuiteEntrance() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const local = suiteEnabled();
    if (!local) return;
    fetch('/api/suite', { cache: 'no-store' })
      .then(res => res.json())
      .then(body => setEnabled(body.enabled === true && local))
      .catch(() => setEnabled(false));
  }, []);

  if (!enabled) return null;

  const url = process.env.NEXT_PUBLIC_SUITE_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUITE_PUBLISHABLE_KEY || '';

  async function start() {
    const client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
    const startOAuth = client.auth.signInWithOAuth as (credentials: {
      provider: string;
      options?: { redirectTo?: string };
    }) => Promise<unknown>;
    await startOAuth({
      provider: SUITE_PROVIDER,
      options: { redirectTo: window.location.origin + '/suite' },
    });
  }

  return (
    <section className="mt-6 rounded-2xl border border-gray-800 p-4" aria-labelledby="suite-heading">
      <h2 id="suite-heading" className="text-sm font-bold tracking-widest text-gray-400">360° BREWING</h2>
      <p className="mt-2 text-sm text-gray-300">Continue to 360° Brewing to sign in. You leave this map and return afterward. That sign-in is separate from the email account on this page and does not grant steward.</p>
      <button type="button" onClick={start} className="mt-4 min-h-12 rounded-lg bg-white px-4 font-semibold text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300">
        Continue to 360° Brewing
      </button>
    </section>
  );
}
