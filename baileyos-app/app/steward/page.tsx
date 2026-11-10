'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { PublicTally, VoteOption } from '@/lib/brew/question001';
import { suiteConfig } from '@/lib/suite/verify';

type Report = {
  members: number;
  recentSignIns: number;
  question: PublicTally & { prompt: string; votes: { at: string; option: VoteOption }[] };
};

export default function StewardReport() {
  const [message, setMessage] = useState('Checking access.');
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    const config = suiteConfig();
    if (!config) {
      setMessage('Sign in required.');
      return;
    }
    const client = createClient(config.url, config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce' },
    });
    client.auth.getSession().then(async ({ data }) => {
      const token = data.session?.access_token;
      if (!token) {
        setMessage('Sign in required.');
        return;
      }
      const res = await fetch('/api/steward/report', { headers: { authorization: `Bearer ${token}` } });
      const body = await res.json().catch(() => ({}));
      if (res.status === 403) {
        setMessage('Steward only');
        return;
      }
      if (!res.ok || typeof body.members !== 'number' || typeof body.recentSignIns !== 'number' || !body.question) {
        setMessage(res.status === 401 ? 'Sign in required.' : 'The report could not be read.');
        return;
      }
      setReport({ members: body.members, recentSignIns: body.recentSignIns, question: body.question });
      setMessage('');
    }).catch(() => setMessage('Sign in required.'));
  }, []);

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <p className="text-sm font-bold tracking-wide text-gray-400">360° BREWING</p>
      <h1 className="mt-2 text-3xl font-bold">Steward Consensus Report</h1>
      {message && <p className="mt-4 text-lg text-amber-100" role="alert">{message}</p>}
      {report && (
        <div className="mt-6 space-y-3 text-gray-200">
          <p>Verified members: {report.members}</p>
          <p>Verified sign-ins in the last 7 days: {report.recentSignIns}</p>
          <h2 className="pt-4 text-lg font-semibold text-white">Question #001</h2>
          <p>{report.question.prompt}</p>
          <p>Verified votes: {report.question.total}</p>
          <ul className="space-y-1">
            {report.question.options.map(item => (
              <li key={item.option}>{item.option}. {item.label}: {item.count} ({item.percent}%)</li>
            ))}
          </ul>
          <h3 className="pt-2 font-semibold text-white">Votes over time</h3>
          {report.question.votes.length === 0 ? <p>No votes yet.</p> : (
            <ul className="space-y-1">
              {report.question.votes.map(vote => <li key={`${vote.at}-${vote.option}`}>{vote.at} · {vote.option}</li>)}
            </ul>
          )}
        </div>
      )}
      <a className="mt-8 inline-flex min-h-12 items-center font-semibold text-cyan-300 underline" href="/">Back to the map</a>
    </main>
  );
}
