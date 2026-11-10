'use client';

import React, { useEffect, useState } from 'react';
import type { PublicTally, VoteOption } from '@/lib/brew/question001';

type Row = { at: string; option: VoteOption; receipt: string };

export default function VoteVerification() {
  const [tally, setTally] = useState<PublicTally | null>(null);
  const [votes, setVotes] = useState<Row[]>([]);
  const [message, setMessage] = useState('Loading the vote log.');

  useEffect(() => {
    fetch('/api/brew/q/001/verify').then(res => res.json()).then(body => {
      if (!body?.tally || !Array.isArray(body.votes)) {
        setMessage('The vote log could not be read.');
        return;
      }
      setTally(body.tally);
      setVotes(body.votes);
      setMessage('');
    }).catch(() => setMessage('The vote log could not be read.'));
  }, []);

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <p className="text-sm font-bold tracking-wide text-gray-400">360° BREWING</p>
      <h1 className="mt-2 text-3xl font-bold">Question #001 vote log</h1>
      <p className="mt-4 text-gray-300">Each row is a time, an option, and a receipt. The receipt is a per-question hash. It does not show who voted.</p>
      {message && <p className="mt-4 text-amber-100">{message}</p>}
      {tally && <p className="mt-4 text-gray-200">Verified votes: {tally.total}</p>}
      {tally && (
        <ul className="mt-2 space-y-1 text-gray-300">
          {tally.options.map(item => <li key={item.option}>{item.option}: {item.count}</li>)}
        </ul>
      )}
      <ul className="mt-6 space-y-3 text-sm text-gray-300">
        {votes.map(row => <li key={row.receipt}>{row.at} · {row.option} · {row.receipt}</li>)}
      </ul>
    </main>
  );
}
