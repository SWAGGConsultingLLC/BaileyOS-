'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { BackToMap } from '@/components/BackToMap';
import { BrewLogo } from '@/components/BrewLogo';
import { linkedInReturnInProgress, prepareSuiteHref } from '@/components/SuiteEntrance';
import { BREW_RETURN_KEY, QUESTION_PROMPT, QUESTION_VOTE_PATH, VOTE_OPTIONS, closedQuestionMessage, questionIsClosed, voteLabel, votingClosesMessage, type PublicResults, type PublicTally, type VoteOption } from '@/lib/brew/question001';
import { suiteConfig } from '@/lib/suite/verify';

type Mine = { option: VoteOption | null; label: string | null };

const LINKEDIN_VOTE = 'Voting needs a LinkedIn sign-in. These choices sign you in with LinkedIn and bring you back to this question.';

function applyWindow(body: Partial<PublicResults>, setClosed: (value: boolean) => void, setWindowMessage: (value: string) => void) {
  if (typeof body.closes_at !== 'string' && body.closed !== true) return;
  const closesAt = typeof body.closes_at === 'string' ? body.closes_at : null;
  const isClosed = body.closed === true || questionIsClosed(closesAt);
  setClosed(isClosed);
  if (typeof body.message === 'string' && body.message) {
    setWindowMessage(body.message);
  } else if (isClosed) {
    setWindowMessage(closedQuestionMessage(closesAt));
  } else if (closesAt) {
    setWindowMessage(votingClosesMessage(closesAt));
  }
}

export default function QuestionVote() {
  const [tally, setTally] = useState<PublicTally | null>(null);
  const [mine, setMine] = useState<Mine | null>(null);
  const [needsLinkedIn, setNeedsLinkedIn] = useState(true);
  const [href, setHref] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState(false);
  const [windowMessage, setWindowMessage] = useState('');

  useEffect(() => {
    let cancel = false;
    fetch('/api/brew/q/001/results', { cache: 'no-store' }).then(res => res.json()).then(body => {
      if (cancel) return;
      if (typeof body.total === 'number' && Array.isArray(body.options)) setTally(body);
      applyWindow(body, setClosed, setWindowMessage);
    }).catch(() => undefined);
    if (!linkedInReturnInProgress(window.location.href)) {
      prepareSuiteHref(window.location.origin + '/suite').then(ready => {
        if (!cancel && 'href' in ready) setHref(ready.href);
      }).catch(() => undefined);
    }
    const config = suiteConfig();
    if (!config) return () => { cancel = true; };
    const client = createClient(config.url, config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce' },
    });
    client.auth.getSession().then(async ({ data }) => {
      const token = data.session?.access_token;
      if (!token) {
        if (!cancel) setNeedsLinkedIn(true);
        return;
      }
      const res = await fetch('/api/brew/q/001/vote', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (cancel) return;
      if (!res.ok) {
        setNeedsLinkedIn(true);
        return;
      }
      const body = await res.json();
      setNeedsLinkedIn(false);
      setMine({ option: body.option ?? null, label: body.label ?? null });
    }).catch(() => { if (!cancel) setNeedsLinkedIn(true); });
    return () => { cancel = true; };
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
      setNeedsLinkedIn(true);
      setNotice(LINKEDIN_VOTE);
      return;
    }
    const res = await fetch('/api/brew/q/001/vote', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ option }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.status === 401) {
      setNeedsLinkedIn(true);
      setNotice(LINKEDIN_VOTE);
      return;
    }
    if (res.status === 409 || body.closed) {
      const closesAt = typeof body.closes_at === 'string' ? body.closes_at : null;
      setClosed(true);
      setWindowMessage(typeof body.error === 'string' ? body.error : closedQuestionMessage(closesAt));
      setNotice('');
      const results = await fetch('/api/brew/q/001/results', { cache: 'no-store' }).then(item => item.json()).catch(() => null);
      if (results && typeof results.total === 'number') {
        setTally(results);
        applyWindow(results, setClosed, setWindowMessage);
      }
      return;
    }
    if (!res.ok || !body.option) {
      setNotice('The vote could not be recorded.');
      return;
    }
    setMine({ option: body.option, label: body.label });
    const results = await fetch('/api/brew/q/001/results', { cache: 'no-store' }).then(item => item.json()).catch(() => null);
    if (results && typeof results.total === 'number') {
      setTally(results);
      applyWindow(results, setClosed, setWindowMessage);
    }
  }

  const showChoices = !closed && !mine?.option;

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <BrewLogo />
      <h1 className="mt-2 text-3xl font-bold">Question #001</h1>
      <p className="mt-4 text-lg text-gray-200">{QUESTION_PROMPT}</p>
      {windowMessage && (
        <p className="mt-4 text-lg font-semibold text-amber-50" role="status">{windowMessage}</p>
      )}
      {mine?.option && (
        <p className="mt-4 text-lg font-semibold text-amber-50" role="status">Your vote is recorded. {mine.label ?? voteLabel(mine.option)}</p>
      )}
      {showChoices && (needsLinkedIn || notice) && (
        <div className="mt-6 rounded-xl border-2 border-amber-200 bg-amber-950 px-4 py-4 text-lg font-semibold text-amber-50" role={notice ? 'alert' : 'status'}>
          {needsLinkedIn && <p>{LINKEDIN_VOTE}</p>}
          {notice && notice !== LINKEDIN_VOTE && <p className={needsLinkedIn ? 'mt-2' : ''}>{notice}</p>}
        </div>
      )}
      {showChoices && (
        <div className="mt-6 space-y-3">
          {VOTE_OPTIONS.map(item => needsLinkedIn ? (
            <a key={item.option} href={href ?? undefined} onClick={() => sessionStorage.setItem(BREW_RETURN_KEY, QUESTION_VOTE_PATH)} className={`flex min-h-12 items-center rounded-lg bg-white px-4 font-semibold text-black ${href ? '' : 'pointer-events-none opacity-60'}`}>
              {item.option}. {item.label}
            </a>
          ) : (
            <button key={item.option} type="button" disabled={busy} onClick={() => choose(item.option)} className="flex min-h-12 w-full items-center rounded-lg bg-white px-4 text-left font-semibold text-black disabled:opacity-60">
              {item.option}. {item.label}
            </button>
          ))}
        </div>
      )}
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
      <div><BackToMap /></div>
    </main>
  );
}
