'use client';

import React, { useEffect, useState } from 'react';
import type { PublicTally, VoteOption } from '@/lib/brew/question001';

type Row = { at: string; option: VoteOption; receipt: string };
type Log = { tally: PublicTally; votes: Row[] };

export function VoteLog({ initial }: { initial: Log }) {
  const [log, setLog] = useState(initial);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancel = false;
    const load = () => {
      fetch('/api/brew/q/001/verify', { cache: 'no-store' }).then(res => res.json()).then(body => {
        if (cancel) return;
        if (!body?.tally || !Array.isArray(body.votes)) {
          setMessage('The vote log could not be read.');
          return;
        }
        setLog(body);
        setMessage('');
      }).catch(() => { if (!cancel) setMessage('The vote log could not be read.'); });
    };
    const onShow = (event: PageTransitionEvent) => { if (event.persisted) load(); };
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    window.addEventListener('pageshow', onShow);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancel = true;
      window.removeEventListener('pageshow', onShow);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return (
    <>
      {message && <p className="mt-4 text-amber-100">{message}</p>}
      <p className="mt-4 text-gray-200">Verified votes: {log.tally.total}</p>
      <ul className="mt-2 space-y-1 text-gray-300">
        {log.tally.options.map(item => <li key={item.option}>{item.option}: {item.count}</li>)}
      </ul>
      <ul className="mt-6 space-y-3 text-sm text-gray-300">
        {log.votes.map(row => <li key={row.receipt}>{row.at} · {row.option} · {row.receipt}</li>)}
      </ul>
    </>
  );
}
