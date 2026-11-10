'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { prepareSuiteHref } from '@/components/SuiteEntrance';
import { BREW_RETURN_KEY, QUESTION_PROMPT, QUESTION_VOTE_PATH, VOTE_OPTIONS, voteLabel, type PublicTally, type VoteOption } from '@/lib/brew/question001';
import { suiteConfig } from '@/lib/suite/verify';

type Mine = { option: VoteOption | null; label: string | null };

export default function QuestionVote() {
  const [tally, setTally] = useState<PublicTally | null>(null);
  const [mine, setMine] = useState<Mine | null>(null);
  const [signedOut, setSignedOut] = useState(true);
  const [href, setHref] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/brew/q/001/results').then(res => res.json()).then(body => {
      if (typeof body.total === 'number' && Array.isArray(body.options)) setTally(body);
    }).catch(() => undefined);
    const config = suiteConfig();
    if (!config) return;
    const client = createClient(config.url, config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce' },
    });
    client.auth.getSession().then(async ({ data }) => {
      const token = data.session?.access_token;
      if (!token) {
        setSignedOut(true);
        const ready = await prepareSuiteHref(window.location.origin + '/suite');
        if ('href' in ready) setHref(ready.href);
        return;
      }
      setSignedOut(false);
      const res = await fetch('/api/brew/q/001/vote', { headers: { authorization: `Bearer ${token}` } });
      if (!res.ok) {
        setNotice('A verified LinkedIn sign-in is required before a vote is recorded.');
        return;
      }
      const body = await res.json();
      setMine({ option: body.option ?? null, label: body.label ?? null });
    }).catch(() => setSignedOut(true));
  }, []);

  async function choose(option: VoteOption) {
    const config = suiteConfig();
    if (!config) return;
    setBusy(true);
    const client = createClient(config.url, config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce' },
    });
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setBusy(false);
      return;
    }
    const res = await fetch('/api/brew/q/001/vote', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ option }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok || !body.option) {
      setNotice('The vote could not be recorded.');
      return;
    }
    setMine({ option: body.option, label: body.label });
    const results = await fetch('/api/brew/q/001/results').then(item => item.json()).catch(() => null);
    if (results && typeof results.total === 'number') setTally(results);
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <p className="text-sm font-bold tracking-wide text-gray-400">360° BREWING</p>
      <h1 className="mt-2 text-3xl font-bold">Question #001</h1>
      <p className="mt-4 text-lg text-gray-200">{QUESTION_PROMPT}</p>
      {mine?.option && (
        <p className="mt-4 text-amber-100" role="status">Your vote is recorded. {mine.label ?? voteLabel(mine.option)}</p>
      )}
      {!mine?.option && (
        <div className="mt-6 space-y-3">
          {VOTE_OPTIONS.map(item => signedOut ? (
            <a key={item.option} href={href ?? undefined} onClick={() => sessionStorage.setItem(BREW_RETURN_KEY, QUESTION_VOTE_PATH)} className="flex min-h-12 items-center rounded-lg bg-white px-4 font-semibold text-black">
              {item.option}. {item.label}
            </a>
          ) : (
            <button key={item.option} type="button" disabled={busy} onClick={() => choose(item.option)} className="flex min-h-12 w-full items-center rounded-lg bg-white px-4 text-left font-semibold text-black disabled:opacity-60">
              {item.option}. {item.label}
            </button>
          ))}
          {signedOut && <p className="text-sm text-gray-300">The first tap signs in with LinkedIn and returns to this question.</p>}
        </div>
      )}
      {notice && <p className="mt-4 text-amber-100" role="alert">{notice}</p>}
      {tally && (
        <section className="mt-8">
          <h2 className="text-sm font-bold tracking-widest text-gray-400">RESULTS</h2>
          <p className="mt-2 text-gray-200">Verified votes: {tally.total}</p>
          <ul className="mt-2 space-y-1 text-gray-300">
            {tally.options.map(item => (
              <li key={item.option}>{item.option}. {item.label}: {item.count} ({item.percent}%)</li>
            ))}
          </ul>
        </section>
      )}
      <a className="mt-8 inline-flex min-h-12 items-center font-semibold text-cyan-300 underline" href="/brew/q/001">Back to the question</a>
    </main>
  );
}
