'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { SuiteBadge } from '@/components/SuiteEntrance';
import { suiteStatusText } from '@/lib/steward/decide';
import { suiteCallbackMessage, suiteEnabled } from '@/lib/suite/verify';

export default function SuiteReturn() {
  const [message, setMessage] = useState('Checking the 360° Brewing sign-in.');
  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState<{ recorded: boolean; steward: boolean } | null>(null);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    if (!suiteEnabled() || !url || !key) {
      setMessage('360° Brewing sign-in is not turned on for this map.');
      return;
    }
    const client = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce' },
    });
    const search = window.location.search;
    const code = new URLSearchParams(search).get('code');
    const finish = async () => {
      let exchangeError: string | null = null;
      if (code) {
        const exchanged = await client.auth.exchangeCodeForSession(code);
        exchangeError = exchanged.error?.message ?? null;
      }
      const { data } = await client.auth.getSession();
      const callback = suiteCallbackMessage({
        search,
        exchangeError,
        hasSession: Boolean(data.session?.access_token),
      });
      if (callback.kind !== 'ready' || !data.session?.access_token) {
        setFailed(callback.kind === 'error');
        setMessage(callback.message);
        return;
      }
      const token = data.session.access_token;
      const res = await fetch('/api/suite', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || typeof body.subject !== 'string') {
        setFailed(true);
        setMessage('360° Brewing did not confirm this sign-in. The map email account is unchanged.');
        return;
      }
      const next = { recorded: body.recorded === true, steward: body.steward === true };
      setStatus(next);
      setFailed(!next.recorded);
      setMessage(suiteStatusText(next) || '360° Brewing did not confirm this sign-in.');
    };
    finish().catch(() => {
      setFailed(true);
      setMessage('360° Brewing did not confirm this sign-in. The map email account is unchanged.');
    });
  }, []);

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <p className="text-sm font-bold tracking-wide text-gray-400">360° BREWING</p>
      <h1 className="mt-2 text-3xl font-bold">Return from 360° Brewing</h1>
      <SuiteBadge status={status} />
      <p className={`mt-4 text-lg ${failed ? 'text-amber-100' : 'text-gray-200'}`} role={failed ? 'alert' : 'status'}>{message}</p>
      {!status && !failed && <p className="mt-3 text-sm text-gray-300">LinkedIn asks you to sign in to 360° Brewing. This page stays here and shows the result.</p>}
      <a className="mt-6 inline-flex min-h-12 items-center font-semibold text-cyan-300 underline" href="/">Back to the map</a>
    </main>
  );
}
