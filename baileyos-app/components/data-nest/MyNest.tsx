'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AccountPanel } from '@/components/AccountPanel';
import { DEFAULT_CENTER, pointOnRing } from '@/lib/landing-stone/compass';
import { browserSupabase } from '@/lib/supabaseBrowser';
import { CANON_HREF, compassMarks, type ReadingLabel, type StoredReading } from '@/lib/data-nest/nestView';

type Cell = { id: string; lat: number; lon: number; label: string; placed: 'user_nest' | 'default' };
type Act = { act: string; record_sha256: string | null; created_at: string };
type NestBody = {
  cell: Cell;
  readings: (Omit<StoredReading, 'sourceUrl' | 'sourceTimestamp' | 'httpStatus' | 'payloadSha256' | 'recordCount' | 'fetchedAt'> & {
    source_url: string;
    fetched_at: string;
    record_count: number;
    payload_sha256: string;
  })[];
  acts: Act[];
};

function asReadings(body: NestBody | null): StoredReading[] {
  if (!body) return [];
  return body.readings.map((row) => ({
    source: row.source,
    sourceUrl: row.source_url,
    fetchedAt: row.fetched_at,
    sourceTimestamp: null,
    httpStatus: null,
    available: row.available,
    recordCount: row.record_count,
    payloadSha256: row.payload_sha256,
    error: row.error,
    label: row.label,
    items: row.items,
  }));
}

export function MyNest() {
  const sb = useMemo(() => browserSupabase(), []);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [nest, setNest] = useState<NestBody | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<'pull' | 'forget' | null>(null);
  const [confirmForget, setConfirmForget] = useState(false);

  useEffect(() => {
    if (!sb) { setReady(true); return; }
    let stop = false;
    sb.auth.getSession().then(({ data }) => {
      if (stop) return;
      setToken(data.session?.access_token ?? null);
      setReady(true);
    }).catch(() => { if (!stop) setReady(true); });
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      setToken(session?.access_token ?? null);
    });
    return () => { stop = true; sub.subscription.unsubscribe(); };
  }, [sb]);

  useEffect(() => {
    if (!token) { setNest(null); return; }
    let stop = false;
    fetch('/api/data-nest/nest', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (stop) return;
        if (!res.ok) { setNote(typeof body.error === 'string' ? body.error : 'The nest could not be read.'); return; }
        setNest(body);
      })
      .catch(() => { if (!stop) setNote('The nest could not be read.'); });
    return () => { stop = true; };
  }, [token]);

  async function pull() {
    if (!token) return;
    setBusy('pull');
    setNote(null);
    const res = await fetch('/api/data-nest/pull', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: '{}',
    });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { setNote(typeof body.error === 'string' ? body.error : 'The pull could not be stored.'); return; }
    setNote('Pulled into your nest.');
    const next = await fetch('/api/data-nest/nest', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
    const stored = await next.json().catch(() => null);
    if (next.ok && stored) setNest(stored);
  }

  async function forget() {
    if (!token) return;
    if (!confirmForget) { setConfirmForget(true); return; }
    setBusy('forget');
    setNote(null);
    const res = await fetch('/api/data-nest/nest/forget', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    setConfirmForget(false);
    if (!res.ok) { setNote(typeof body.error === 'string' ? body.error : 'The nest could not be cleared.'); return; }
    const next = await fetch('/api/data-nest/nest', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
    const stored = await next.json().catch(() => null);
    if (next.ok && stored) setNest(stored);
    setNote('Your nest is cleared.');
  }

  const cell = nest?.cell ?? { id: '39.06,-108.55', lat: DEFAULT_CENTER.lat, lon: DEFAULT_CENTER.lon, label: DEFAULT_CENTER.name, placed: 'default' as const };
  const readings = asReadings(nest);
  const marks = compassMarks(cell, readings);
  const sources = newestSources(readings);

  return (
    <main className="mx-auto min-h-screen max-w-lg bg-[#05080f] px-4 py-6 text-slate-100">
      <p className="text-xs font-bold tracking-[0.2em] text-cyan-300">DATA NEST</p>
      <h1 className="mt-2 text-3xl font-semibold text-white">Your nest</h1>
      <p className="mt-3 text-base leading-7">Feeds are stored only when you pull. Nothing runs on a schedule.</p>
      <p className="mt-2"><a className="text-cyan-200 underline" href="/data-nest">Data Nest</a></p>

      {!ready && <p className="mt-6" role="status">Checking sign-in…</p>}
      {ready && !token && (
        <section className="mt-6" aria-label="Sign in">
          <p className="text-lg text-white">Sign in to pull feeds into your nest.</p>
          <div className="mt-3">
            <AccountPanel client={sb} onAccessToken={setToken} deferProfile />
          </div>
        </section>
      )}

      {token && (
        <>
          <section className="mt-6" aria-label="Pull">
            <button type="button" className="min-h-12 w-full rounded-2xl bg-cyan-300 font-semibold text-black" onClick={() => void pull()} disabled={busy !== null}>
              {busy === 'pull' ? 'Pulling…' : 'Pull to my nest'}
            </button>
            <p className="mt-2 text-sm text-slate-300">Cell {cell.label} · {cell.id} · {cell.placed === 'default' ? 'default' : 'your cell'}</p>
          </section>

          <section className="mt-6" aria-label="Compass">
            <h2 className="text-lg text-cyan-200">Compass</h2>
            <p className="mt-1 text-sm text-slate-300">
              {cell.placed === 'default'
                ? `Center is ${DEFAULT_CENTER.name}, the default.`
                : `Center is ${cell.label}.`}
              {' '}Points come from stored readings.
            </p>
            <svg viewBox="0 0 320 320" className="mx-auto mt-3 w-full max-w-sm" role="img" aria-label="Compass for your cell">
              <circle cx="160" cy="160" r="118" fill="none" stroke="#67e8f9" strokeWidth="1.5" />
              <circle cx="160" cy="160" r="4" fill="#fff" />
              <text x="160" y="148" textAnchor="middle" fill="#fff" fontSize="11">You</text>
              {marks.map((mark) => {
                const point = pointOnRing(160, 160, mark.radius, mark.bearing);
                return (
                  <g key={mark.id}>
                    <line x1="160" y1="160" x2={point.x} y2={point.y} stroke="#67e8f9" strokeWidth="1" />
                    <circle cx={point.x} cy={point.y} r="3.5" fill="#fff" />
                  </g>
                );
              })}
            </svg>
            <ul className="mt-2 space-y-2 text-sm">
              {sources.map((row) => (
                <li key={row.source}>
                  <span className="font-semibold text-white">{row.source}</span>
                  {' · '}
                  <LabelText label={row.label} />
                  {row.label === 'live provider response' ? ` · ${row.recordCount} published` : ''}
                  {row.error ? ` · ${row.error}` : ''}
                </li>
              ))}
              {!sources.length && <li>No stored readings yet.</li>}
              {marks.map((mark) => (
                <li key={mark.id}>{mark.title} · {mark.bearing}° · {mark.distanceKm} km · {mark.label}</li>
              ))}
            </ul>
          </section>

          <section className="mt-6" aria-label="Timeline">
            <h2 className="text-lg text-cyan-200">Timeline</h2>
            <ul className="mt-2 space-y-2 text-sm">
              {(nest?.acts || []).map((act) => (
                <li key={act.created_at + act.act} className="rounded-2xl border border-slate-800 p-3">
                  <span className="text-white">{act.act}</span>
                  {' · '}
                  {act.created_at}
                  <br />
                  <span className="break-all text-xs text-cyan-200">{act.record_sha256 ? `record ${act.record_sha256}` : 'no record hash'}</span>
                </li>
              ))}
              {!nest?.acts?.length && <li>No acts yet.</li>}
            </ul>
          </section>

          <section className="mt-6" aria-label="81 Canon">
            <h2 className="text-lg text-cyan-200">81 Canon</h2>
            <p className="mt-1 text-sm text-slate-300">The 81 Canon is the foundation. This is a link only. This page does not record that you open it.</p>
            <a className="mt-2 inline-flex min-h-11 items-center text-cyan-200 underline" href={CANON_HREF} rel="noreferrer noopener">81 Canon</a>
          </section>

          <section className="mt-6" aria-label="Forget">
            <button type="button" className="min-h-12 w-full rounded-2xl border border-slate-600" onClick={() => void forget()} disabled={busy !== null}>
              {busy === 'forget' ? 'Clearing…' : 'Forget my nest'}
            </button>
            {confirmForget && <p className="mt-2 text-sm text-amber-100">Press Forget my nest again to clear your readings, acts, and cell.</p>}
          </section>
        </>
      )}

      {note && <p className="mt-4 text-sm" role="status">{note}</p>}
    </main>
  );
}

function LabelText({ label }: { label: ReadingLabel }) {
  return <span>{label}</span>;
}

function newestSources(readings: StoredReading[]) {
  if (!readings.length) return [];
  const newest = readings.reduce((max, row) => row.fetchedAt > max ? row.fetchedAt : max, readings[0].fetchedAt);
  return readings.filter((row) => row.fetchedAt === newest);
}
