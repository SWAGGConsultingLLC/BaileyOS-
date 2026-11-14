'use client';

import { useState } from 'react';

const NOTE = 'This is a tamper-evident decision record. The seal shows the record was not altered after sealing. It does not show the decision was correct or that the data was accurate.';

export default function VerifyPage() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<{ ok?: boolean; problems?: string[]; note?: string; record_sha256?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    setError(null);
    let record: unknown;
    try { record = JSON.parse(text); } catch { setError('That is not JSON.'); return; }
    const res = await fetch('/api/data-nest/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ record }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error || 'The checker did not run.'); setResult(null); return; }
    setResult(data);
  }

  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 py-6">
      <p className="text-xs font-bold tracking-[0.2em] text-cyan-300">DATA NEST</p>
      <h1 className="mt-2 text-3xl font-semibold">Check a decision record</h1>
      <p className="mt-3 text-base leading-7 text-slate-200">{NOTE}</p>
      <label className="mt-4 block text-sm" htmlFor="record">Paste a record</label>
      <textarea id="record" value={text} onChange={(e) => setText(e.target.value)} rows={10} className="mt-2 w-full rounded-2xl border border-slate-700 bg-transparent p-3 text-sm" />
      <button type="button" className="mt-3 min-h-12 w-full rounded-2xl bg-cyan-300 font-semibold text-black" onClick={() => void check()}>Recompute the seal</button>
      {error && <p className="mt-3 text-sm text-amber-100" role="alert">{error}</p>}
      {result && (
        <section className="mt-4 rounded-2xl border border-cyan-400/40 p-3 text-sm leading-6">
          <p>{result.ok ? 'The seal matches. The pasted bytes were not altered after sealing.' : 'The seal does not match.'}</p>
          <p className="mt-2">{result.note || NOTE}</p>
          {result.problems?.length ? <ul className="mt-2 list-disc pl-5">{result.problems.map((item) => <li key={item}>{item}</li>)}</ul> : null}
          {result.record_sha256 && <p className="mt-2 break-all text-xs text-cyan-200">{result.record_sha256}</p>}
        </section>
      )}
      <p className="mt-6 text-sm"><a className="text-cyan-300 underline" href="/data-nest">Data Nest</a></p>
    </main>
  );
}
