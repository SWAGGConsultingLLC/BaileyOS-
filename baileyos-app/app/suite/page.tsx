'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { suiteEnabled } from '@/lib/suite/verify';

export default function SuiteReturn() {
  const [message, setMessage] = useState('Checking the 360° Brewing sign-in.');

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUITE_SUPABASE_URL || '';
    const key = process.env.NEXT_PUBLIC_SUITE_PUBLISHABLE_KEY || '';
    if (!suiteEnabled() || !url || !key) {
      setMessage('360° Brewing sign-in is not turned on for this map.');
      return;
    }
    const client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
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
      setMessage('360° Brewing confirmed this sign-in. The map email account is unchanged, and this does not grant steward.');
    }).catch(() => setMessage('360° Brewing did not confirm this sign-in. The map email account is unchanged.'));
  }, []);

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <p className="text-sm font-bold tracking-wide text-gray-400">360° BREWING</p>
      <h1 className="mt-2 text-3xl font-bold">Return from 360° Brewing</h1>
      <p className="mt-4 text-lg text-gray-200" role="status">{message}</p>
      <a className="mt-6 inline-flex min-h-12 items-center font-semibold text-cyan-300 underline" href="/">Back to the map</a>
    </main>
  );
}
