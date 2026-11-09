'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { SuiteBadge } from '@/components/SuiteEntrance';
import { suiteStatusText } from '@/lib/steward/decide';
import { suiteEnabled } from '@/lib/suite/verify';

export default function SuiteReturn() {
  const [message, setMessage] = useState('Checking the 360° Brewing sign-in.');
  const [status, setStatus] = useState<{ recorded: boolean; steward: boolean } | null>(null);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUITE_SUPABASE_URL || '';
    const key = process.env.NEXT_PUBLIC_SUITE_PUBLISHABLE_KEY || '';
    if (!suiteEnabled() || !url || !key) {
      setMessage('360° Brewing sign-in is not turned on for this map.');
      return;
    }
    const client = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
    });
    client.auth.getSession().then(async ({ data }) => {
      const token = data.session?.access_token;
      if (!token) {
        setMessage('360° Brewing has not confirmed a sign-in on this map yet. Use Continue on the map, which leaves this site and returns here.');
        return;
      }
      const res = await fetch('/api/suite', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || typeof body.subject !== 'string') {
        setMessage('360° Brewing did not confirm this sign-in. The map email account is unchanged.');
        return;
      }
      const next = { recorded: body.recorded === true, steward: body.steward === true };
      setStatus(next);
      setMessage(suiteStatusText(next) || '360° Brewing did not confirm this sign-in.');
    }).catch(() => setMessage('360° Brewing did not confirm this sign-in. The map email account is unchanged.'));
  }, []);

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <p className="text-sm font-bold tracking-wide text-gray-400">360° BREWING</p>
      <h1 className="mt-2 text-3xl font-bold">Return from 360° Brewing</h1>
      <SuiteBadge status={status} />
      <p className="mt-4 text-lg text-gray-200" role="status">{message}</p>
      {!status && <p className="mt-3 text-sm text-gray-300">If a 360° Brewing screen opens, choose Sign in with LinkedIn or Sign in. Do not choose Sign up or Create account.</p>}
      <a className="mt-6 inline-flex min-h-12 items-center font-semibold text-cyan-300 underline" href="/">Back to the map</a>
    </main>
  );
}
