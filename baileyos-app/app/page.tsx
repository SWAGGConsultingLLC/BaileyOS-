'use client';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import { browserSupabase } from '@/lib/supabaseBrowser';
import { AccountPanel } from '@/components/AccountPanel';
import { BrewLogo } from '@/components/BrewLogo';
import { SuiteEntrance } from '@/components/SuiteEntrance';
import { SuiteIdentity } from '@/components/SuiteIdentity';
import { QUESTION_PROMPT } from '@/lib/brew/question001';
import { suiteReturnTarget } from '@/lib/suite/verify';
import type { Cell } from '@/components/MapView';

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false, loading: () => <div className="h-[340px]" /> });

type Mine = Cell & { placement_id: number; link_token: string; linked?: boolean; show_linkedin?: boolean };
const MINE_KEY = 'baileyos_mine_v1', TOKEN_KEY = 'baileyos_device_v1';

function deviceToken(): string {
  try {
    let t = localStorage.getItem(TOKEN_KEY);
    if (!t) { t = crypto.randomUUID() + crypto.randomUUID(); localStorage.setItem(TOKEN_KEY, t); }
    return t;
  } catch { return crypto.randomUUID() + crypto.randomUUID(); }
}

export default function Home() {
  const [cells, setCells] = useState<Cell[]>([]);
  const [total, setTotal] = useState(0);
  const [mine, setMine] = useState<Mine | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [frameKey, setFrameKey] = useState(0);
  const [session, setSession] = useState<string | null>(null);
  const [suiteSignedIn, setSuiteSignedIn] = useState(false);
  const [showLinkedIn, setShowLinkedIn] = useState(false);
  const onAccessToken = useCallback((token: string | null) => setSession(token), []);
  const onSuiteStatus = useCallback((status: { recorded: boolean } | null) => {
    const signedIn = status?.recorded === true;
    setSuiteSignedIn(signedIn);
    if (!signedIn) setShowLinkedIn(false);
  }, []);
  const sb = browserSupabase();

  const load = useCallback(async () => {
    try { const r = await fetch('/api/placements'); if (r.ok) { const j = await r.json(); setCells(j.cells); setTotal(j.total); } } catch {}
  }, []);

  useEffect(() => {
    const target = suiteReturnTarget(window.location.href);
    if (target) window.location.replace(target);
  }, []);

  useEffect(() => {
    try { const s = localStorage.getItem(MINE_KEY); if (s) setMine(JSON.parse(s)); } catch {}
    load(); const i = setInterval(load, 30000); return () => clearInterval(i);
  }, [load]);

  const saveMine = (m: Mine | null) => { setMine(m); try { m ? localStorage.setItem(MINE_KEY, JSON.stringify(m)) : localStorage.removeItem(MINE_KEY); } catch {} };

  function share() {
    if (!navigator.geolocation) { setMsg('Location is not available in this browser.'); return; }
    setBusy(true); setMsg('Finding your place…');
    navigator.geolocation.getCurrentPosition(async pos => {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        const showProfile = suiteSignedIn && showLinkedIn;
        if (showProfile) {
          const configUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
          const configKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
          if (configUrl && configKey) {
            const { createClient } = await import('@supabase/supabase-js');
            const client = createClient(configUrl, configKey, { auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, flowType: 'pkce' } });
            const { data } = await client.auth.getSession();
            if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
          }
        }
        const r = await fetch('/api/place', {
          method: 'POST', headers,
          body: JSON.stringify({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy_m: pos.coords.accuracy, device_token: deviceToken(), timestamp: Date.now(), show_linkedin: showProfile })
        });
        const j = await r.json();
        if (!r.ok) setMsg(j.error || 'Could not place you.');
        else if (j.status === 'duplicate') {
          if (mine) saveMine({ ...mine, show_linkedin: j.shared_profile === true });
          setShowLinkedIn(j.shared_profile === true);
          setMsg(j.shared_profile ? 'Your name and photo are on this check-in.' : 'You are already placed for today.');
          await load();
        }
        else { saveMine({ band_km: j.band_km, sector: j.sector, placement_id: j.placement_id, link_token: j.link_token, show_linkedin: j.shared_profile === true }); setMsg('Placed.'); await load(); }
      } catch { setMsg('Network error. Nothing was recorded.'); }
      setBusy(false);
    }, err => { setBusy(false); setMsg(err.code === 1 ? 'Location permission denied. Nothing was recorded.' : 'Could not get a position.'); },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  }

  async function removeLinkedIn() {
    if (!mine) return;
    const r = await fetch('/api/place', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ placement_id: mine.placement_id, link_token: mine.link_token }),
    });
    if (!r.ok) { setMsg('Could not remove the name and photo.'); return; }
    saveMine({ ...mine, show_linkedin: false });
    setShowLinkedIn(false);
    setMsg('Your name and photo were removed. The check-in stays on the map without them.');
    await load();
  }

  async function linkCall(method: 'POST' | 'DELETE') {
    if (!mine || !session) return;
    const r = await fetch('/api/link', { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session}` },
      body: method === 'POST' ? JSON.stringify({ placement_id: mine.placement_id, link_token: mine.link_token }) : undefined });
    if (r.ok) { saveMine({ ...mine, linked: method === 'POST' }); setMsg(method === 'POST' ? 'Linked to your desk.' : 'Unlinked.'); }
    else setMsg('Could not update the link.');
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <p className="text-sm font-semibold text-gray-300">SWAGG Consulting</p>
      <div className="mt-2 text-sm font-bold tracking-[0.35em] text-cyanx">BAILEYOS</div>
      <h1 className="mt-3 text-4xl font-extrabold text-white">Show up. Get placed.</h1>
      <p className="mt-2 text-gray-400">BaileyOS is a community map by SWAGG Consulting. People can share roughly where they are, and they can join 360° Brewing questions. An account is optional and does not place you on the map.</p>
      <SuiteIdentity onStatus={onSuiteStatus} />
      <section className="mt-5 rounded-2xl border border-gray-800 p-4" aria-labelledby="question-001-heading">
        <BrewLogo size={64} />
        <h2 id="question-001-heading" className="mt-3 text-lg font-semibold text-white">Question #001</h2>
        <p className="mt-2 text-gray-300">{QUESTION_PROMPT}</p>
        <a className="mt-4 inline-flex min-h-12 items-center rounded-lg bg-white px-4 font-semibold text-black" href="/brew/q/001">Answer Question #001</a>
      </section>

      <div className="mt-5 overflow-hidden rounded-2xl border-2 border-goldx/70"><MapView cells={cells} mine={mine} frameKey={frameKey} /></div>

      <div className="mt-4 flex items-center justify-between">
        <button onClick={() => setFrameKey(k => k + 1)} className="text-xs font-bold tracking-widest text-cyanx">FRAME THE MESA</button>
        <span className="text-xs tracking-widest text-gray-500">PLACED {total}</span>
      </div>
      <div className="mt-1 text-2xl font-bold text-white">{mine ? `Your area: ${mine.band_km}–${mine.band_km + 5} km from the map center` : 'No area shared yet'}</div>
      <p className="mt-1 text-gray-400">Nothing is saved until you tap Share my place. The browser asks for your location only then.</p>

      <button onClick={share} disabled={busy} className="mt-5 w-full rounded-full bg-cyanx py-4 text-lg font-bold text-black disabled:opacity-60">Share my place</button>
      {suiteSignedIn && (
        <label className="mt-3 flex min-h-11 items-start gap-2 text-sm text-gray-200">
          <input type="checkbox" checked={showLinkedIn} onChange={event => setShowLinkedIn(event.target.checked)} />
          <span>Show my LinkedIn profile with my check-in. This stays off until you turn it on. It adds the name and photo from your LinkedIn sign-in. A profile link is added only when LinkedIn provides one.</span>
        </label>
      )}
      {suiteSignedIn && mine?.show_linkedin && (
        <button type="button" onClick={removeLinkedIn} className="mt-2 min-h-11 font-semibold text-gray-300 underline">Remove my name and photo</button>
      )}
      <p className="mt-2 text-xs text-gray-500">What is saved is a rough area: a 5 km band and a direction from the map center, not your exact coordinates. It uses a device token, not an email, and it is not tied to an account unless you later choose to link it.</p>
      <SuiteEntrance onSignedIn={setSuiteSignedIn} />
      <AccountPanel client={sb} onAccessToken={onAccessToken} deferProfile={suiteSignedIn} />
      {session && mine && (
        <div className="mt-3">
          <button onClick={() => linkCall(mine.linked ? 'DELETE' : 'POST')} className="w-full rounded-full border border-goldx/60 py-3 font-semibold text-goldx">
            {mine.linked ? 'Unlink my placement from my desk' : 'Link my placement to my desk (optional)'}
          </button>
          <p className="mt-2 text-xs text-gray-400">This stays on the map. It saves your latest pin to the email account signed in here. It does not open 360° Brewing.</p>
        </div>
      )}
      {msg && <p className="mt-3 text-sm text-gray-300">{msg}</p>}
    </main>
  );
}
