'use client';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import { browserSupabase } from '@/lib/supabaseBrowser';
import { AccountPanel } from '@/components/AccountPanel';
import { SuiteEntrance } from '@/components/SuiteEntrance';
import type { Cell } from '@/components/MapView';

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false, loading: () => <div className="h-[340px]" /> });

type Mine = Cell & { placement_id: number; link_token: string; linked?: boolean };
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
  const onAccessToken = useCallback((token: string | null) => setSession(token), []);
  const sb = browserSupabase();

  const load = useCallback(async () => {
    try { const r = await fetch('/api/placements'); if (r.ok) { const j = await r.json(); setCells(j.cells); setTotal(j.total); } } catch {}
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
        const r = await fetch('/api/place', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy_m: pos.coords.accuracy, device_token: deviceToken(), timestamp: Date.now() })
        });
        const j = await r.json();
        if (!r.ok) setMsg(j.error || 'Could not place you.');
        else if (j.status === 'duplicate') setMsg('You are already placed for today.');
        else { saveMine({ band_km: j.band_km, sector: j.sector, placement_id: j.placement_id, link_token: j.link_token }); setMsg('Placed.'); await load(); }
      } catch { setMsg('Network error. Nothing was recorded.'); }
      setBusy(false);
    }, err => { setBusy(false); setMsg(err.code === 1 ? 'Location permission denied. Nothing was recorded.' : 'Could not get a position.'); },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
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
      <div className="text-sm font-bold tracking-[0.35em] text-cyanx">BAILEYOS</div>
      <h1 className="mt-3 text-4xl font-extrabold text-white">Show up. Get placed.</h1>
      <p className="mt-2 text-gray-400">Share where you are. An account is optional and does not place you on the map. The books stay in the works.</p>
      <p className="mt-3 text-sm text-goldx">•?81⊞81·ΔS◇0 | 81ABSCS81</p>
      <p className="text-sm text-goldx">The bearing stays 81ABSCS81. Rewriting the holder does not transfer the firm.</p>
      <p className="text-xs text-goldx/80">(to SWAGG Consulting LLC)</p>

      <div className="mt-5 overflow-hidden rounded-2xl border-2 border-goldx/70"><MapView cells={cells} mine={mine} frameKey={frameKey} /></div>

      <div className="mt-4 flex items-center justify-between">
        <button onClick={() => setFrameKey(k => k + 1)} className="text-xs font-bold tracking-widest text-cyanx">FRAME THE MESA</button>
        <span className="text-xs tracking-widest text-gray-500">PLACED {total}</span>
      </div>
      <div className="mt-1 text-2xl font-bold text-white">{mine ? `Placed: ${mine.band_km}–${mine.band_km + 5} km` : 'No pin yet'}</div>
      <p className="mt-1 text-gray-400">The pin is your place. Nothing is assigned until you share it.</p>

      <button onClick={share} disabled={busy} className="mt-5 w-full rounded-full bg-cyanx py-4 text-lg font-bold text-black disabled:opacity-60">Share my place</button>
      <p className="mt-2 text-xs text-gray-500">Sharing a place uses a device token, not an email. You can do it before you have an account.</p>
      <AccountPanel client={sb} onAccessToken={onAccessToken} />
      <SuiteEntrance />
      {session && mine && (
        <button onClick={() => linkCall(mine.linked ? 'DELETE' : 'POST')} className="mt-3 w-full rounded-full border border-goldx/60 py-3 font-semibold text-goldx">
          {mine.linked ? 'Unlink my placement from my desk' : 'Link my placement to my desk (optional)'}
        </button>
      )}
      {msg && <p className="mt-3 text-sm text-gray-300">{msg}</p>}
    </main>
  );
}
