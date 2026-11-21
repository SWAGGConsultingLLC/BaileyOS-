'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { QUESTION_PROMPT, VOTE_OPTIONS, type VoteOption } from '@/lib/brew/question001';
import { DEFAULT_CENTER, placeRelative, pointOnRing } from '@/lib/landing-stone/compass';
import { lightMeaning } from '@/lib/landing-stone/cockpit';

type Light = { state?: string; line?: string };
type Seat = { id: string; name: string; seat: string; bearing: number; status: string };
type Mark = { id: string; bearing: number; reason: string };
type Act = { act: string; head_sha256: string | null; created_at: string };
type RingItem = { id: string; title: string; layer: string; lat: number | null; lon: number | null; sourceName: string };
type RingFeed = { id: string; name: string; status: string; detail: string };
type Ring = { feeds?: RingFeed[]; items?: RingItem[]; terrain?: { status?: string; elevation_m?: number | null; image?: string | null; source?: string } };
type BrewOption = { option: string; label: string; count: number; percent: number };
type Brew = { total?: number; options?: BrewOption[]; message?: string; error?: string };
type Center = { lat: number; lon: number; name: string; label: 'default' | 'opt-in' };
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

function brewArc(start: number, sweep: number): string {
  if (sweep <= 0) return '';
  const from = pointOnRing(160, 160, 78, start);
  const to = pointOnRing(160, 160, 78, start + sweep);
  return `M ${from.x} ${from.y} A 78 78 0 ${sweep > 180 ? 1 : 0} 1 ${to.x} ${to.y}`;
}

export default function CockpitPage() {
  const [deck, setDeck] = useState<Deck | null>(null);
  const [note, setNote] = useState('Steward only');
  const [token, setToken] = useState('');
  const [center, setCenter] = useState<Center>(DEFAULT_CENTER);
  const [ring, setRing] = useState<Ring | null>(null);
  const [terrainFailed, setTerrainFailed] = useState(false);
  const [brew, setBrew] = useState<Brew | null>(null);

  async function loadRing(next: Center) {
    const res = await fetch(`/api/landing-stone/cockpit/ring?lat=${next.lat}&lon=${next.lon}`, { cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    setTerrainFailed(false);
    setRing(res.ok ? body : { feeds: [], items: [], terrain: { status: 'not connected' } });
  }

  async function load(bearer = token) {
    const res = await fetch('/api/landing-stone/cockpit', {
      cache: 'no-store',
      headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
    });
    const body = await res.json().catch(() => ({}));
    setDeck(body);
    if (body.steward) setNote('You are the steward. Everyone else can still look.');
    else if (bearer) setNote('You can look and vote. Convene, Approve, and Stand down are steward only.');
    else setNote('Anyone can look. No account is needed. Convene, Approve, and Stand down are steward only.');
  }

  async function refreshBrew() {
    const res = await fetch('/api/brew/q/001/results', { cache: 'no-store' });
    const body = await res.json().catch(() => ({ error: 'The tally could not be read.' }));
    setBrew(body);
  }

  async function castVote(option: VoteOption) {
    if (!token) return;
    setNote('Sending your vote through Question #001.');
    const res = await fetch('/api/brew/q/001/vote', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ option }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setNote(typeof body.error === 'string' ? body.error : 'The vote could not be recorded. Open Question #001.');
      return;
    }
    setNote(body.already ? 'Your vote was already recorded.' : 'Your vote is recorded.');
    refreshBrew();
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
    loadRing(DEFAULT_CENTER);
    refreshBrew().catch(() => setBrew({ error: 'The tally could not be read.' }));
  }, []);

  function shareLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      const next: Center = {
        lat: Math.round(pos.coords.latitude * 100) / 100,
        lon: Math.round(pos.coords.longitude * 100) / 100,
        name: 'your coarsened area',
        label: 'opt-in',
      };
      setCenter(next);
      loadRing(next);
    });
  }

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
  const terrainOn = ring?.terrain?.status === 'connected' && Boolean(ring.terrain.image) && !terrainFailed;
  const chain = pointOnRing(160, 160, 40, 180);
  const placed = (ring?.items || []).flatMap((item) => {
    const spot = placeRelative(center, item);
    return spot ? [{ ...item, ...spot }] : [];
  });
  const brewOptions = brew?.options || [];
  const brewTotal = brew?.total || 0;

  return (
    <main className="mx-auto min-h-screen max-w-lg bg-[#05080f] px-4 py-6 text-[#f2e2c4]">
      <p className="font-mono text-xs tracking-[0.16em] text-[#C9943A]">LANDING STONE · COCKPIT</p>
      <h1 className="mt-2 text-3xl text-white">Your view</h1>
      <p className="mt-3 text-xl text-white">The lights inform. The steward decides.</p>
      <p className="mt-2 text-lg">No account is needed to look. Share your location only if you want. Voting uses Question #001.</p>
      <nav className="mt-4 grid gap-2" aria-label="Existing pages">
        <a className="inline-flex min-h-14 items-center rounded border border-[#9ad7ff]/40 px-4 text-lg text-[#9ad7ff]" href="/data-nest">Data Nest</a>
        <a className="inline-flex min-h-14 items-center rounded border border-[#9ad7ff]/40 px-4 text-lg text-[#9ad7ff]" href="/landing-stone">Landing Stone</a>
        <a className="inline-flex min-h-14 items-center rounded border border-[#9ad7ff]/40 px-4 text-lg text-[#9ad7ff]" href="/landing-stone/prototype">Prototype</a>
      </nav>

      <section className="mt-6 border-t border-[#C9943A]/40 pt-4" aria-label="Lights">
        <p className="font-mono text-2xl text-[#C9943A]">{lock}</p>
        <p className="mt-1 text-lg">{lights?.lock_line || 'PENDING — an independent anchor is not published.'}</p>
        <p className="mt-1 text-lg">{lightMeaning('lock', lock)}</p>
        <ul className="mt-4 space-y-4">
          {LIGHTS.map(([label, key]) => {
            const light = lights?.[key];
            const state = light?.state || 'PENDING';
            const kind = key === 'feed_health' ? 'feed' : key === 'chain_integrity' ? 'chain' : 'consensus';
            return (
              <li key={key}>
                <p className="font-mono text-sm tracking-widest text-[#C9943A]">{label}</p>
                <p className="text-2xl text-white">{state}</p>
                <p className="text-lg">{light?.line || 'Waiting for the ruling log.'}</p>
                <p className="text-lg">{lightMeaning(kind, state)}</p>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 font-mono text-xs break-all">Head {lights?.head_sha256 || 'not available'}</p>
      </section>

      <section className="mt-6 border-t border-[#C9943A]/40 pt-4" aria-label="Compass">
        <h2 className="text-lg text-[#C9943A]">One fold</h2>
        <p className="mt-1">{deck?.lights_win || 'If this compass and the lights disagree, the lights win.'}</p>
        <p className="mt-2">
          {center.label === 'default'
            ? 'Center is Grand Junction, CO, the default. The exact point stays on this phone until you opt in, and it is not written into the chain.'
            : 'Center is your coarsened area. The exact point stays on this phone and is not written into the chain.'}
        </p>
        <button type="button" onClick={shareLocation} className="mt-3 min-h-14 w-full rounded border border-[#C9943A]/70 px-4 text-left text-lg">Use my location</button>
        <div className="relative mx-auto mt-3 w-full max-w-sm">
          {terrainOn && ring?.terrain?.image && (
            <img src={ring.terrain.image} alt="USGS 3DEP shaded relief" className="absolute left-[13%] top-[13%] h-[74%] w-[74%] rounded-full object-cover opacity-80" onError={() => setTerrainFailed(true)} />
          )}
          <svg viewBox="0 0 320 320" className="relative w-full" role="img" aria-label="Compass around the viewer">
            <circle cx="160" cy="160" r="118" fill="none" stroke="#C9943A" strokeWidth="1.5" />
            <circle cx="160" cy="160" r="78" fill="none" stroke="#9ad7ff" strokeWidth="10" opacity="0.35" />
            {brewTotal > 0 && brewOptions.map((option, index) => {
              const before = brewOptions.slice(0, index).reduce((sum, item) => sum + item.percent, 0);
              const path = brewArc(20 + (before / 100) * 360, (option.percent / 100) * 360);
              return path ? <path key={option.option} d={path} fill="none" stroke="#9ad7ff" strokeWidth="8" /> : null;
            })}
            {(deck?.feed_marks || []).map((mark) => (
              <path key={mark.id} d={arcPath(mark.bearing, 108)} fill="none" stroke="#C9943A" strokeWidth="8" />
            ))}
            {(deck?.dissent_bearings || []).map((bearing) => (
              <path key={bearing} d={arcPath(bearing, 112)} fill="none" stroke="#ff8f8f" strokeWidth="4" />
            ))}
            <line x1="160" y1="160" x2={chain.x} y2={chain.y} stroke="#f2e2c4" strokeWidth="1" />
            <circle cx={chain.x} cy={chain.y} r="4" fill="#f2e2c4" />
            <text x={chain.x} y={chain.y + 14} textAnchor="middle" fill="#f2e2c4" fontSize="8">chain</text>
            {placed.map((item) => {
              const point = pointOnRing(160, 160, item.radius, item.bearing);
              return (
                <g key={item.id}>
                  <line x1="160" y1="160" x2={point.x} y2={point.y} stroke="#C9943A" strokeWidth="1" opacity="0.7" />
                  <circle cx={point.x} cy={point.y} r="3.5" fill="#fff" />
                </g>
              );
            })}
            {(deck?.seats || []).map((seat) => {
              const point = pointOnRing(160, 160, 118, seat.bearing);
              return (
                <g key={seat.id}>
                  <line x1="160" y1="160" x2={point.x} y2={point.y} stroke="#5c5346" strokeWidth="1" />
                  <circle cx={point.x} cy={point.y} r="6" fill={seat.status === 'ready' ? '#C9943A' : '#5c5346'} />
                  <text x={point.x} y={point.y - 12} textAnchor="middle" fill="#f2e2c4" fontSize="9">{seat.seat}</text>
                </g>
              );
            })}
            <circle cx="160" cy="160" r="26" fill="none" stroke="#f2e2c4" strokeWidth="1.5" />
            <circle cx="160" cy="160" r="4" fill="#fff" />
            <text x="160" y="150" textAnchor="middle" fill="#fff" fontSize="11">You</text>
            <text x="160" y="292" textAnchor="middle" fill="#C9943A" fontSize="12">Steward · South</text>
          </svg>
        </div>
        <p className="mt-2 text-sm">
          {terrainOn
            ? `${ring?.terrain?.source} elevation ${ring?.terrain?.elevation_m} m under the ring.`
            : 'terrain not connected'}
        </p>
        <p className="mt-2 text-sm">{QUESTION_PROMPT}</p>
        <p className="text-sm">
          <a className="text-[#9ad7ff] underline" href="/brew/q/001">Question #001</a>
          {' '}
          {brew?.error ? 'The tally could not be read.' : brew?.message || (brewTotal === 0 ? 'No votes are recorded yet.' : `${brewTotal} verified votes, counted in the open.`)}
        </p>
        <div className="mt-3 grid gap-2">
          {(brewOptions.length ? brewOptions : VOTE_OPTIONS.map((item) => ({ ...item, count: 0, percent: 0 }))).map((option) => (
            token ? (
              <button key={option.option} type="button" onClick={() => castVote(option.option as VoteOption)} className="min-h-14 w-full rounded bg-white px-4 text-left text-lg font-semibold text-black">
                {option.option}. {option.label}{typeof option.count === 'number' ? ` · ${option.count}` : ''}
              </button>
            ) : (
              <a key={option.option} href="/brew/q/001/vote" className="inline-flex min-h-14 w-full items-center rounded bg-white px-4 text-lg font-semibold text-black">
                {option.option}. {option.label}{typeof option.count === 'number' ? ` · ${option.count}` : ''}
              </a>
            )
          ))}
        </div>
        <p className="mt-2 text-lg">Voting uses the existing Question #001 flow. LinkedIn sign-in is required to vote. Looking needs no account.</p>
        <ul className="mt-2 space-y-1 text-sm">
          {(ring?.feeds || []).map((feed) => (
            <li key={feed.id}>{feed.name}: {feed.detail}</li>
          ))}
          {placed.slice(0, 8).map((item) => (
            <li key={item.id}>{item.title} · {item.bearing}° · {item.distanceKm} km</li>
          ))}
          {(deck?.seats || []).map((seat) => (
            <li key={seat.id}>Seat {seat.seat} {seat.name} · {seat.status}</li>
          ))}
          {(deck?.veto_lines || []).map((line) => <li key={line}>Veto {line}</li>)}
        </ul>
      </section>

      <section className="mt-6 border-t border-[#C9943A]/40 pt-4" aria-label="Steward controls">
        <h2 className="text-lg text-[#C9943A]">South</h2>
        <p role="status" className="mt-1 text-lg">{note}</p>
        {!steward && <p className="mt-1 text-lg">Steward only</p>}
        <div className="mt-3 grid gap-2">
          {(['convene', 'approve', 'stand_down'] as const).map((name) => (
            <button
              key={name}
              type="button"
              disabled={!steward}
              onClick={() => act(name)}
              className="min-h-14 w-full rounded border border-[#C9943A]/70 px-4 text-left text-lg uppercase tracking-wide disabled:opacity-40"
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
