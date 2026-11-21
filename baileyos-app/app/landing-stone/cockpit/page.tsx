'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { pointOnRing } from '@/lib/landing-stone/compass';

type Light = { state?: string; line?: string };
type Seat = { id: string; name: string; seat: string; bearing: number; status: string };
type Mark = { id: string; bearing: number; reason: string };
type Act = { act: string; head_sha256: string | null; created_at: string };
type Deck = {
  steward?: boolean;
  lights?: {
    consensus?: Light;
    feed_health?: Light;
    chain_integrity?: Light;
    continuity_lock?: string;
    lock_line?: string;
    head_sha256?: string | null;
  } | null;
  seats?: Seat[];
  dissent_bearings?: number[];
  feed_marks?: Mark[];
  veto_lines?: string[];
  acts?: Act[];
  acts_configured?: boolean;
  lights_win?: string;
};

const LIGHTS = [
  ['Consensus', 'consensus'],
  ['Feed Health', 'feed_health'],
  ['Chain Integrity', 'chain_integrity'],
] as const;

function arcPath(bearing: number, radius: number): string {
  const start = pointOnRing(160, 160, radius, bearing - 14);
  const end = pointOnRing(160, 160, radius, bearing + 14);
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 0 1 ${end.x} ${end.y}`;
}

export default function CockpitPage() {
  const [deck, setDeck] = useState<Deck | null>(null);
  const [note, setNote] = useState('Steward only');
  const [token, setToken] = useState('');

  async function load(bearer = token) {
    const res = await fetch('/api/landing-stone/cockpit', {
      cache: 'no-store',
      headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
    });
    const body = await res.json().catch(() => ({}));
    setDeck(body);
    setNote(body.steward ? 'Signed in as steward.' : 'Steward only');
  }

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    if (!url || !key) {
      load('');
      return;
    }
    const client = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce' },
    });
    client.auth.getSession().then(({ data }) => {
      const next = data.session?.access_token || '';
      setToken(next);
      load(next);
    }).catch(() => load(''));
  }, []);

  async function act(name: 'convene' | 'approve' | 'stand_down') {
    if (!deck?.steward || !token) return;
    setNote('Sending the steward act.');
    const res = await fetch('/api/landing-stone/cockpit', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ act: name }),
    });
    const body = await res.json().catch(() => ({}));
    setNote(typeof body.error === 'string' ? body.error : body.stored ? `${name} recorded.` : 'The act was not stored.');
    load(token);
  }

  const lights = deck?.lights;
  const lock = lights?.continuity_lock === 'ANCHORED' ? 'ANCHORED' : 'PENDING';
  const steward = deck?.steward === true;

  return (
    <main className="mx-auto min-h-screen max-w-lg bg-[#05080f] px-4 py-6 text-[#f2e2c4]">
      <p className="font-mono text-xs tracking-[0.16em] text-[#C9943A]">LANDING STONE · COCKPIT</p>
      <h1 className="mt-2 text-3xl text-white">Steward cockpit</h1>
      <p className="mt-3 text-xl text-white">The lights inform. The steward decides.</p>
      <nav className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-base" aria-label="Existing pages">
        <a className="inline-flex min-h-11 items-center text-[#9ad7ff] underline" href="/data-nest">Data Nest</a>
        <a className="inline-flex min-h-11 items-center text-[#9ad7ff] underline" href="/landing-stone">Landing Stone</a>
        <a className="inline-flex min-h-11 items-center text-[#9ad7ff] underline" href="/landing-stone/prototype">Prototype</a>
        <a className="inline-flex min-h-11 items-center text-[#9ad7ff] underline" href="/suite">360° Brewing sign-in</a>
      </nav>

      <section className="mt-6 border-t border-[#C9943A]/40 pt-4" aria-label="Lights">
        <p className="font-mono text-2xl text-[#C9943A]">{lock}</p>
        <p className="mt-1">{lights?.lock_line || 'PENDING — an independent anchor is not published.'}</p>
        <ul className="mt-3 space-y-3">
          {LIGHTS.map(([label, key]) => {
            const light = lights?.[key];
            return (
              <li key={key}>
                <p className="font-mono text-xs tracking-widest text-[#C9943A]">{label}</p>
                <p className="text-lg text-white">{light?.state || 'PENDING'}</p>
                <p>{light?.line || 'Waiting for the ruling log.'}</p>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 font-mono text-xs break-all">Head {lights?.head_sha256 || 'not available'}</p>
      </section>

      <section className="mt-6 border-t border-[#C9943A]/40 pt-4" aria-label="Compass">
        <h2 className="text-lg text-[#C9943A]">Compass</h2>
        <p className="mt-1">{deck?.lights_win || 'If this compass and the lights disagree, the lights win.'}</p>
        <svg viewBox="0 0 320 320" className="mx-auto mt-3 w-full max-w-sm" role="img" aria-label="Seat compass">
          <circle cx="160" cy="160" r="118" fill="none" stroke="#C9943A" strokeWidth="1.5" />
          <circle cx="160" cy="160" r="28" fill="#11161f" stroke="#f2e2c4" />
          <text x="160" y="164" textAnchor="middle" fill="#f2e2c4" fontSize="10">GLYPH</text>
          {(deck?.feed_marks || []).map((mark) => (
            <path key={mark.id} d={arcPath(mark.bearing, 108)} fill="none" stroke="#C9943A" strokeWidth="8" strokeLinecap="butt" />
          ))}
          {(deck?.dissent_bearings || []).map((bearing) => (
            <path key={bearing} d={arcPath(bearing, 96)} fill="none" stroke="#ff8f8f" strokeWidth="4" />
          ))}
          {(deck?.seats || []).map((seat) => {
            const point = pointOnRing(160, 160, 118, seat.bearing);
            return (
              <g key={seat.id}>
                <circle cx={point.x} cy={point.y} r="6" fill={seat.status === 'ready' ? '#C9943A' : '#5c5346'} />
                <text x={point.x} y={point.y - 12} textAnchor="middle" fill="#f2e2c4" fontSize="9">{seat.seat}</text>
              </g>
            );
          })}
          <text x="160" y="292" textAnchor="middle" fill="#C9943A" fontSize="12">Steward · South</text>
        </svg>
        <ul className="mt-2 space-y-1 text-sm">
          {(deck?.seats || []).map((seat) => (
            <li key={seat.id}>Seat {seat.seat} {seat.name} · {seat.status}</li>
          ))}
          {(deck?.veto_lines || []).map((line) => <li key={line}>Veto {line}</li>)}
          {(deck?.feed_marks || []).map((mark) => <li key={mark.id}>{mark.id} · {mark.reason}</li>)}
        </ul>
      </section>

      <section className="mt-6 border-t border-[#C9943A]/40 pt-4" aria-label="Steward controls">
        <h2 className="text-lg text-[#C9943A]">South</h2>
        <p role="status" className="mt-1">{note}</p>
        <div className="mt-3 grid gap-2">
          {(['convene', 'approve', 'stand_down'] as const).map((name) => (
            <button
              key={name}
              type="button"
              disabled={!steward}
              onClick={() => act(name)}
              className="min-h-12 rounded border border-[#C9943A]/70 px-3 text-left uppercase tracking-wide disabled:opacity-40"
            >
              {name === 'stand_down' ? 'Stand down' : name}
            </button>
          ))}
        </div>
        <p className="mt-3 text-sm">Convene needs a real Data Nest report. This deck does not create one. Approve and stand down are steward records, not votes, and they do not change the lights.</p>
        {(deck?.acts || []).length > 0 && (
          <ul className="mt-3 space-y-1 font-mono text-xs break-all">
            {deck?.acts?.map((item) => (
              <li key={item.created_at + item.act}>{item.act} · {item.created_at} · {item.head_sha256 || 'no head'}</li>
            ))}
          </ul>
        )}
        {deck && deck.acts_configured === false && <p className="mt-2 text-sm">The steward act log is not configured yet.</p>}
      </section>
    </main>
  );
}
