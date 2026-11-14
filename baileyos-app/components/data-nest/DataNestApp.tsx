'use client';

import dynamic from 'next/dynamic';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccountPanel } from '@/components/AccountPanel';
import { browserSupabase } from '@/lib/supabaseBrowser';
import { decideSessionExposure } from '@/lib/account';
import { aheadCards, buildScene, corridorDistanceKm, sampleNodes, type SceneFeature } from '@/lib/data-nest/scene';
import { coarsen, shouldAcceptFix } from '@/lib/data-nest/geo';
import { chatEnabled, nextAutoMode, type NestMode } from '@/lib/data-nest/mode';
import type { LiveItem, NeedsSetup } from '@/lib/data-nest/liveFeeds';
import { Swarm } from './Swarm';
import { Radar } from './Radar';

const NestMap = dynamic(() => import('./NestMap'), { ssr: false });

const PLACES = [
  { name: 'Grand Junction, CO', lat: 39.0639, lon: -108.5506 },
  { name: 'Fruita, CO', lat: 39.1589, lon: -108.7306 },
  { name: 'Palisade, CO', lat: 39.1103, lon: -108.3509 },
  { name: 'Rifle, CO', lat: 39.5347, lon: -107.7831 },
  { name: 'Glenwood Springs, CO', lat: 39.5505, lon: -107.3248 },
  { name: 'Moab, UT', lat: 38.5733, lon: -109.5498 },
  { name: 'Green River, UT', lat: 38.9953, lon: -110.1618 },
];

type Fix = { lat: number; lon: number; accuracy: number | null; speed: number | null; heading: number | null; at: string };
type Seal = {
  report: { summary: { overall: string }; checks: { id: string; title: string; status: string; detail: string }[]; input_sha256: string; freshness?: { sources: { id: string; status: string; detail: string }[] } };
  report_sha256: string;
  report_canonical_json: string;
  input_sha256: string;
  input_canonical_json: string;
  kimi_package: unknown;
};
type LogLine = { at: string; hash: string; text: string };

const LAYERS = ['quakes', 'nws', 'roads', 'amber', 'silver', 'observation', 'corridor', 'nodes'] as const;

export function DataNestApp() {
  const sb = useMemo(() => browserSupabase(), []);
  const [token, setToken] = useState<string | null>(null);
  const [mode, setMode] = useState<NestMode>('stationary');
  const [modeLock, setModeLock] = useState<'auto' | 'manual'>('auto');
  const [fix, setFix] = useState<Fix | null>(null);
  const [watching, setWatching] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [placeQuery, setPlaceQuery] = useState('');
  const [radiusKm, setRadiusKm] = useState(80);
  const [layers, setLayers] = useState<Record<string, boolean>>(() => Object.fromEntries(LAYERS.map((id) => [id, true])));
  const [items, setItems] = useState<LiveItem[]>([]);
  const [needs, setNeeds] = useState<NeedsSetup[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [seal, setSeal] = useState<Seal | null>(null);
  const [gemini, setGemini] = useState<{ at: string; text: string; hash: string } | null>(null);
  const [geminiVote, setGeminiVote] = useState<unknown>(null);
  const [kimi, setKimi] = useState('');
  const [queen, setQueen] = useState<{ at: string; label: string; hash: string; record?: string } | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const [tab, setTab] = useState<'swarm' | 'radar' | 'corridor' | 'log'>('swarm');
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [passenger, setPassenger] = useState(false);
  const [confirmPassenger, setConfirmPassenger] = useState(false);
  const [voice, setVoice] = useState(false);
  const [chat, setChat] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [draft, setDraft] = useState('');
  const spoken = useRef(new Set<string>());
  const lastFix = useRef<{ t: number; lat: number; lon: number } | null>(null);

  useEffect(() => {
    if (!sb) return;
    let stop = false;
    const apply = (event: string | null, session: Parameters<typeof decideSessionExposure>[0]['session']) => {
      const decision = decideSessionExposure({ event, recoveryPending: false, session, nowSec: Math.floor(Date.now() / 1000) });
      if (!stop) setToken(decision.exposeToken);
    };
    sb.auth.getSession().then(({ data }) => apply(null, data.session)).catch(() => setToken(null));
    const { data: sub } = sb.auth.onAuthStateChange((event, session) => apply(event, session));
    return () => { stop = true; sub.subscription.unsubscribe(); };
  }, [sb]);

  useEffect(() => {
    if (!watching || typeof navigator === 'undefined' || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition((pos) => {
      const next = { t: Date.now(), lat: pos.coords.latitude, lon: pos.coords.longitude };
      if (!shouldAcceptFix(lastFix.current, next)) return;
      lastFix.current = next;
      setFix({
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
        speed: typeof pos.coords.speed === 'number' ? pos.coords.speed : null,
        heading: typeof pos.coords.heading === 'number' && pos.coords.heading >= 0 ? pos.coords.heading : null,
        at: new Date().toISOString(),
      });
      setLocError(null);
    }, () => setLocError('Location permission was declined. Type a place or tap the map.'), { enableHighAccuracy: true, maximumAge: 8000, timeout: 15000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [watching]);

  useEffect(() => {
    if (modeLock !== 'auto') return;
    setMode((current) => nextAutoMode(fix?.speed ?? null, current));
  }, [fix?.speed, modeLock]);

  const scene = useMemo(() => buildScene(items, fix ? { lat: fix.lat, lon: fix.lon } : null).filter((feature) => layers[feature.layer] !== false), [items, fix, layers]);
  const ahead = useMemo(() => aheadCards(scene, fix ? { lat: fix.lat, lon: fix.lon } : null, fix?.heading ?? null, fix?.speed ?? null), [scene, fix]);
  const distance = fix ? corridorDistanceKm(fix.lon, fix.lat) : null;
  const typing = mode === 'stationary' && chatEnabled(fix?.speed ?? null, passenger);
  const center = fix ? { lat: fix.lat, lon: fix.lon } : { lat: 39.06, lon: -108.55 };

  useEffect(() => {
    if (!voice || mode !== 'traveling' || typeof window === 'undefined' || !window.speechSynthesis) return;
    for (const card of ahead.slice(0, 3)) {
      if (spoken.current.has(card.id)) continue;
      spoken.current.add(card.id);
      const miles = card.distanceKm == null ? '' : ` ${card.distanceKm.toFixed(0)} kilometers.`;
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(`${card.title}.${miles}`));
    }
  }, [voice, mode, ahead]);

  function pushLog(text: string, hash: string) {
    setLog((lines) => [{ at: new Date().toISOString(), hash, text }, ...lines].slice(0, 40));
  }

  async function authed(path: string, body: unknown) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: token ? `Bearer ${token}` : '' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  }

  function cell() {
    if (!fix) return null;
    return coarsen(fix.lat, fix.lon);
  }

  async function refresh() {
    const here = cell();
    if (!here || !token) { setNote('Set a place first. The server only receives a coarsened area.'); return; }
    setBusy('feeds');
    const { ok, data } = await authed('/api/data-nest/feeds', { ...here, radiusKm });
    setBusy(null);
    if (!ok) { setOffline(true); setNote(data.error || 'Live feeds did not answer. Showing the last copy, if there is one.'); return; }
    setOffline(false);
    setItems(data.items || []);
    setNeeds(data.needsSetup || []);
    setFetchedAt(data.fetchedAt || null);
    setNote(null);
  }

  async function validate() {
    const here = cell();
    if (!here) { setNote('Set a place first.'); return; }
    setBusy('validate');
    const { ok, data } = await authed('/api/data-nest/validate', { ...here, radiusKm });
    setBusy(null);
    if (!ok || !data.package) { setNote(data.error || 'Python did not run.'); return; }
    setSeal(data.package);
    setItems(data.items || items);
    setNeeds(data.needsSetup || needs);
    setFetchedAt(data.acted_at || null);
    setGemini(null); setGeminiVote(null); setQueen(null);
    pushLog(`Python validation ${data.package.report?.summary?.overall || ''}`, data.package.report_sha256);
  }

  async function review() {
    if (!seal) { setNote('Run Python validation first.'); return; }
    setBusy('gemini');
    const conditions = [
      fix ? `Coarsened area ${coarsen(fix.lat, fix.lon).lat}, ${coarsen(fix.lat, fix.lon).lon}` : 'No area',
      distance != null ? `About ${distance.toFixed(0)} km from the sample corridor` : '',
      fetchedAt ? `Feeds fetched ${fetchedAt}` : 'Feeds not refreshed',
      ...items.slice(0, 8).map((item) => `${item.kind}: ${item.title}`),
    ].filter(Boolean).join('\n');
    const { data } = await authed('/api/data-nest/gemini', {
      report_canonical_json: seal.report_canonical_json,
      report_sha256: seal.report_sha256,
      input_sha256: seal.input_sha256,
      conditions,
    });
    setBusy(null);
    const at = data.acted_at || new Date().toISOString();
    if (data.unavailable || data.message === 'Gemini unavailable, try again') {
      setGemini({ at, hash: seal.report_sha256, text: 'Gemini unavailable, try again' });
      setGeminiVote(data.vote || { unavailable: true, reason: 'Gemini unavailable' });
      pushLog('Gemini unavailable', seal.report_sha256);
      return;
    }
    if (data.error) { setNote(data.error); return; }
    const vote = data.vote || {};
    setGeminiVote(vote);
    setGemini({ at, hash: seal.report_sha256, text: `${vote.verdict || 'uncertain'}: ${vote.reason || ''}` });
    pushLog(`Gemini ${vote.verdict || 'uncertain'}`, seal.report_sha256);
  }

  async function convene() {
    if (!seal) { setNote('Run Python validation first.'); return; }
    let kimiVote: unknown = null;
    if (kimi.trim()) {
      try { kimiVote = JSON.parse(kimi); } catch { kimiVote = { raw_reply: kimi, reviewed_report_sha256: seal.report_sha256, reviewed_input_sha256: seal.input_sha256 }; }
    }
    setBusy('queen');
    const here = cell();
    const { data } = await authed('/api/data-nest/consensus', {
      report_canonical_json: seal.report_canonical_json,
      report_sha256: seal.report_sha256,
      input_sha256: seal.input_sha256,
      input_canonical_json: seal.input_canonical_json,
      report: seal.report,
      gemini: geminiVote,
      kimi: kimiVote,
      cell: here,
    });
    setBusy(null);
    if (data.error && !data.queen) { setNote(data.error); return; }
    const label = data.queen?.label || data.queen?.ruling || 'No ruling';
    const hash = data.queen?.report_sha256 || seal.report_sha256;
    setQueen({ at: data.acted_at || new Date().toISOString(), label, hash, record: data.record?.record_sha256 });
    pushLog(label, hash);
    if (data.store_reason) setNote(data.store_reason);
  }

  async function sendChat() {
    const text = draft.trim();
    if (!text || !typing) return;
    const next = [...chat, { role: 'user' as const, content: text }];
    setChat(next);
    setDraft('');
    setBusy('chat');
    const briefing = [
      fix ? `Coarsened area ${coarsen(fix.lat, fix.lon).lat}, ${coarsen(fix.lat, fix.lon).lon}` : 'No area set',
      seal ? `Report ${seal.report_sha256.slice(0, 12)} overall ${seal.report.summary.overall}` : 'No validation yet',
      queen ? `Queen: ${queen.label}` : 'Queen has not been convened',
      ...items.slice(0, 6).map((item) => `${item.agency}: ${item.title}`),
    ].join('\n');
    const { data } = await authed('/api/data-nest/chat', { messages: next, briefing });
    setBusy(null);
    setChat((lines) => [...lines, { role: 'assistant', content: data.reply || data.error || 'Gemini unavailable, try again' }]);
  }

  async function copyPackage() {
    if (!seal) return;
    const text = JSON.stringify(seal.kimi_package, null, 2);
    try { await navigator.clipboard.writeText(text); setNote('Kimi package copied.'); }
    catch { setNote('Clipboard was blocked. The package is in the log below.'); pushLog('Kimi package ready', seal.report_sha256); }
  }

  async function lookupPlace() {
    if (!typing) return;
    setBusy('place');
    const { ok, data } = await authed('/api/data-nest/place', { query: placeQuery });
    setBusy(null);
    if (!ok) { setNote(data.error || 'No match.'); return; }
    setWatching(false);
    setFix({ lat: data.lat, lon: data.lon, accuracy: null, speed: null, heading: null, at: new Date().toISOString() });
    setNote(`${data.label} from the Census geocoder.`);
  }

  function wipe() {
    setFix(null);
    setItems([]);
    setSeal(null);
    setGemini(null);
    setGeminiVote(null);
    setKimi('');
    setQueen(null);
    setChat([]);
    setLog([]);
    setFetchedAt(null);
    setPassenger(false);
    spoken.current.clear();
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    if (token) void authed('/api/data-nest/forget', {});
    setNote('Cleared on this device. Sealed decision records stay in the chain and have no account or location in them.');
  }

  if (!token) {
    return (
      <main className="mx-auto min-h-screen max-w-lg px-4 py-6">
        <p className="text-xs font-bold tracking-[0.2em] text-cyan-300">DATA NEST</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Local overwatch for Grand Junction and I-70</h1>
        <p className="mt-3 text-base leading-7 text-slate-300">Sign in first. After that, the screen follows your location: weather, quakes, and the road alerts we can actually read. The swarm picture is simulated. Live feeds are labeled and linked.</p>
        <p className="mt-3 text-sm leading-6 text-slate-400">Precise location stays on this phone. The server receives only a coarsened area, about 1 km, and does not store it. A separate request log, if the database migration is applied, keeps that coarsened area for 28 days and can be deleted without changing sealed decision records.</p>
        <AccountPanel client={sb} onAccessToken={setToken} deferProfile />
        <p className="mt-6 text-sm"><a className="text-cyan-300 underline" href="/data-nest/verify">Check a decision record</a> · <a className="text-cyan-300 underline" href="/">Map</a></p>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 py-4 pb-16">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-[0.2em] text-cyan-300">DATA NEST</p>
          <h1 className="text-2xl font-semibold text-white">{mode === 'traveling' ? 'Traveling' : 'Stationary'}</h1>
        </div>
        <button type="button" className="min-h-12 rounded-full border border-slate-600 px-3 text-sm" onClick={() => sb?.auth.signOut()}>Sign out</button>
      </header>
      <p className="mt-2 text-sm leading-6 text-amber-100">Don&apos;t interact while driving. This is not a substitute for official alerts.</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {(['auto', 'traveling', 'stationary'] as const).map((choice) => (
          <button key={choice} type="button" className={`min-h-12 rounded-2xl text-sm font-semibold ${((choice === 'auto' && modeLock === 'auto') || (choice !== 'auto' && modeLock === 'manual' && mode === choice)) ? 'bg-cyan-300 text-black' : 'border border-cyan-400/40 text-cyan-100'}`} onClick={() => {
            if (choice === 'auto') setModeLock('auto');
            else { setModeLock('manual'); setMode(choice); }
          }}>{choice === 'auto' ? 'Auto' : choice === 'traveling' ? 'Traveling' : 'Stationary'}</button>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-400">{modeLock === 'auto' ? 'Auto uses speed. About 5 mph switches to Traveling. Under about 2 mph returns to Stationary.' : 'Manual mode stays until you choose Auto.'}</p>

      {mode === 'traveling' ? (
        <section className="mt-4 space-y-3">
          <button type="button" className="min-h-14 w-full rounded-2xl bg-cyan-300 text-lg font-semibold text-black" onClick={() => { if (!watching) setWatching(true); else void refresh(); }}>{watching ? (busy === 'feeds' ? 'Refreshing…' : 'Refresh what is ahead') : 'Use this phone\'s location'}</button>
          {locError && <p className="text-sm text-amber-100">{locError}</p>}
          <p className="text-sm text-slate-300">{fix ? `Fix ${fix.at.slice(11, 19)} UTC. Speed ${fix.speed == null ? 'unknown' : `${Math.round(fix.speed * 2.237)} mph`}.` : 'No fix yet.'} {fetchedAt ? `Feeds ${fetchedAt}.` : 'Feeds not loaded.'} {offline ? 'Last copy kept.' : ''}</p>
          {ahead.map((card) => (
            <article key={card.id} className="rounded-3xl border border-cyan-400/40 bg-[#07111f] p-4">
              <p className="text-xs font-bold uppercase tracking-widest text-cyan-200">Live data · {card.kind} {card.ahead || fix?.heading == null ? '' : '· nearest'}</p>
              <h2 className="mt-1 text-2xl font-semibold text-white">{card.title}</h2>
              <p className="mt-2 text-lg text-slate-100">{card.distanceKm == null ? '' : `${card.distanceKm.toFixed(1)} km`}{card.etaMinutes != null ? ` · about ${Math.round(card.etaMinutes)} min at your speed` : ''}</p>
              <p className="mt-2 text-sm text-slate-300">{card.agency}. Issued {card.issuedAt || 'time not published'}. Expires {card.expiresAt || 'no expiry published'}.</p>
              {card.sourceUrl && <a className="mt-2 inline-flex min-h-11 items-center text-cyan-300 underline" href={card.sourceUrl}>{card.sourceName}</a>}
            </article>
          ))}
          {!ahead.length && <p className="text-slate-300">Nothing ahead yet. Refresh after a location fix.</p>}
          <label className="flex min-h-12 items-center gap-3 text-sm"><input type="checkbox" checked={voice} onChange={(e) => setVoice(e.target.checked)} /> Spoken alerts (this phone only)</label>
        </section>
      ) : (
        <section className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" className="min-h-12 rounded-full bg-cyan-300 px-4 font-semibold text-black" onClick={() => setWatching(true)}>Use location</button>
            <button type="button" className="min-h-12 rounded-full border border-cyan-400/40 px-4" onClick={() => void refresh()} disabled={busy === 'feeds'}>Refresh live data</button>
          </div>
          {locError && <p className="text-sm text-amber-100">{locError}</p>}
          <div className="flex gap-2">
            <label className="sr-only" htmlFor="place">Place</label>
            <input id="place" value={placeQuery} onChange={(e) => setPlaceQuery(e.target.value)} placeholder="Street address" className="min-h-12 flex-1 rounded-2xl border border-slate-700 bg-transparent px-3" disabled={!typing} />
            <button type="button" className="min-h-12 rounded-2xl border border-slate-600 px-3" onClick={() => void lookupPlace()} disabled={!typing}>Find</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {PLACES.map((place) => (
              <button key={place.name} type="button" className="min-h-11 rounded-full border border-slate-700 px-3 text-sm" onClick={() => { setWatching(false); setFix({ lat: place.lat, lon: place.lon, accuracy: null, speed: null, heading: null, at: new Date().toISOString() }); }}>{place.name}</button>
            ))}
          </div>
          <label className="block text-sm text-slate-300">Radius {radiusKm} km
            <input className="mt-1 w-full" type="range" min={25} max={150} step={25} value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))} />
          </label>
          <div className="flex flex-wrap gap-2">
            {LAYERS.map((layer) => (
              <button key={layer} type="button" aria-pressed={layers[layer]} className={`min-h-11 rounded-full px-3 text-sm ${layers[layer] ? 'bg-cyan-900 text-cyan-100' : 'border border-slate-700 text-slate-400'}`} onClick={() => setLayers((curr) => ({ ...curr, [layer]: !curr[layer] }))}>{layer}</button>
            ))}
          </div>
          <NestMap features={scene} center={center} pickEnabled={typing} onPick={(lat, lon) => { setWatching(false); setFix({ lat, lon, accuracy: null, speed: null, heading: null, at: new Date().toISOString() }); }} />
          <button type="button" disabled className="min-h-12 w-full rounded-2xl border border-slate-700 text-slate-500" aria-disabled="true">3D view, coming soon</button>
          <div className="grid grid-cols-4 gap-2 text-sm">
            {(['swarm', 'radar', 'corridor', 'log'] as const).map((name) => (
              <button key={name} type="button" className={`min-h-11 rounded-xl ${tab === name ? 'bg-cyan-300 text-black' : 'border border-slate-700'}`} onClick={() => setTab(name)}>{name}</button>
            ))}
          </div>
          {tab === 'swarm' && <Swarm overall={seal?.report.summary.overall || null} />}
          {tab === 'radar' && <Radar blips={quakeBlips(scene, fix)} />}
          {tab === 'corridor' && <CorridorPanel distance={distance} />}
          {tab === 'log' && <LogPanel lines={log} />}
          <FeedList items={items} fetchedAt={fetchedAt} offline={offline} />
          <NeedsList needs={needs} />
          <section className="space-y-2 rounded-3xl border border-cyan-400/30 p-3">
            <h2 className="text-sm font-bold tracking-widest text-cyan-200">MANUAL TRANSMISSION</h2>
            <p className="text-xs text-slate-400">Each button runs once. Nothing here starts the next step.</p>
            <button type="button" className="min-h-12 w-full rounded-2xl bg-cyan-300 font-semibold text-black" onClick={() => void validate()}>{busy === 'validate' ? 'Running Python…' : 'Run Python validation'}</button>
            {seal && <p className="break-all text-xs text-slate-300">{seal.report.summary.overall} · {seal.report_sha256}</p>}
            {seal?.report.checks?.map((check) => (
              <p key={check.id} className="text-sm text-slate-200"><span className="font-semibold">{check.id} {check.status}</span> · {check.detail}</p>
            ))}
            <button type="button" className="min-h-12 w-full rounded-2xl border border-cyan-400/50" onClick={() => void review()}>{busy === 'gemini' ? 'Asking Gemini…' : 'Gemini review'}</button>
            {gemini && <p className="text-sm text-slate-200">{gemini.at} · {gemini.hash.slice(0, 12)} · {gemini.text}</p>}
            <p className="text-sm font-semibold text-slate-100">Kimi · awaiting Kimi validator</p>
            <p className="text-xs text-slate-400">Copy the package, paste it to Kimi, and paste the reply here. The reply must name this report hash. The server recomputes both hashes. A mismatch counts as uncertain.</p>
            <button type="button" className="min-h-12 w-full rounded-2xl border border-slate-600" onClick={() => void copyPackage()}>Copy package for Kimi</button>
            <label className="block text-sm" htmlFor="kimi">Kimi reply</label>
            <textarea id="kimi" value={kimi} onChange={(e) => setKimi(e.target.value)} disabled={!typing} rows={4} className="w-full rounded-2xl border border-slate-700 bg-transparent p-3 text-sm" placeholder='{"verdict":"agree","reason":"...","reviewed_report_sha256":"...","reviewed_input_sha256":"..."}' />
            <button type="button" className="min-h-12 w-full rounded-2xl border border-cyan-400/50" onClick={() => void convene()}>{busy === 'queen' ? 'Convening…' : 'Convene the Queen'}</button>
            {queen && <p className="text-sm text-slate-100">{queen.at} · {queen.hash.slice(0, 12)} · {queen.label}{queen.record ? ` · record ${queen.record.slice(0, 12)}` : ''}</p>}
          </section>
          <section className="rounded-3xl border border-slate-700 p-3">
            <h2 className="text-sm font-bold tracking-widest text-cyan-200">GEMINI CHAT</h2>
            {!typing && <p className="mt-2 text-sm text-amber-100">Chat is off while this phone is moving. A passenger can turn it on.</p>}
            {!passenger && (
              confirmPassenger
                ? <button type="button" className="mt-2 min-h-12 w-full rounded-2xl bg-amber-200 font-semibold text-black" onClick={() => { setPassenger(true); setConfirmPassenger(false); }}>Confirm I am the passenger</button>
                : <button type="button" className="mt-2 min-h-12 w-full rounded-2xl border border-amber-200/60" onClick={() => setConfirmPassenger(true)}>I&apos;m a passenger</button>
            )}
            <div className="mt-2 space-y-2">
              {chat.map((line, index) => <p key={index} className="text-sm text-slate-200"><span className="font-semibold">{line.role === 'user' ? 'You' : 'Gemini'}: </span>{line.content}</p>)}
            </div>
            <div className="mt-2 flex gap-2">
              <label className="sr-only" htmlFor="chat">Message</label>
              <input id="chat" value={draft} onChange={(e) => setDraft(e.target.value)} disabled={!typing} className="min-h-12 flex-1 rounded-2xl border border-slate-700 bg-transparent px-3" />
              <button type="button" className="min-h-12 rounded-2xl bg-cyan-300 px-4 font-semibold text-black" disabled={!typing || busy === 'chat'} onClick={() => void sendChat()}>Send</button>
            </div>
          </section>
        </section>
      )}

      {note && <p className="mt-3 text-sm text-slate-200" role="status">{note}</p>}
      <section className="mt-4 rounded-3xl border border-slate-800 p-3 text-sm leading-6 text-slate-400">
        <p>Precise location stays on this device and is not shown publicly. Feed requests send a coarsened area (2 decimal degrees, about 1 km) and the server does not store that point. If the ruling-request table exists, the link between your account and a decision record, including that coarsened area, is kept at most 28 days.</p>
        <button type="button" className="mt-2 min-h-12 w-full rounded-2xl border border-slate-600" onClick={wipe}>Delete my data</button>
        <p className="mt-2">A sealed decision record shows it was not altered after sealing. It does not show the decision was correct or that the data was accurate. <a className="text-cyan-300 underline" href="/data-nest/verify">Check a record</a></p>
      </section>
    </main>
  );
}

function quakeBlips(scene: SceneFeature[], fix: Fix | null) {
  if (!fix) return [];
  return scene.filter((feature) => feature.layer === 'quakes' && feature.geometry.type === 'Point').map((feature) => {
    const [lon, lat] = feature.geometry.type === 'Point' ? feature.geometry.coordinates : [0, 0];
    const dy = lat - fix.lat;
    const dx = lon - fix.lon;
    const bearing = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
    const distanceKm = Math.max(1, Math.hypot(dx, dy) * 111);
    return { id: feature.id, bearing, distanceKm };
  });
}

function CorridorPanel({ distance }: { distance: number | null }) {
  return (
    <section className="rounded-3xl border border-cyan-400/30 p-3 text-sm leading-6 text-slate-200">
      <p className="text-xs font-bold uppercase tracking-widest text-amber-200">Sample geometry</p>
      <p className="mt-2">Nine I-70 keypoints from Moab to Glenwood Springs, plus GUARD.LION, QUEEN ANT AGGREGATOR, SIGNAL.ROOSTER, and ORIGIN.BEAR. This is the file the Python validator checks. It is not a live centerline.</p>
      <p className="mt-2">{distance == null ? 'Set a place to see distance to that line.' : `About ${distance.toFixed(1)} km from the sample line.`}</p>
      <ul className="mt-2 space-y-1">
        {sampleNodes().map((node) => <li key={node.id}>{node.name} · sample node</li>)}
      </ul>
    </section>
  );
}

function LogPanel({ lines }: { lines: LogLine[] }) {
  if (!lines.length) return <p className="text-sm text-slate-400">No steps yet.</p>;
  return (
    <ol className="space-y-2 text-sm">
      {lines.map((line) => <li key={line.at + line.hash} className="rounded-2xl border border-slate-800 p-3"><span className="text-slate-400">{line.at}</span><br />{line.text}<br /><span className="break-all text-xs text-cyan-200">{line.hash}</span></li>)}
    </ol>
  );
}

function FeedList({ items, fetchedAt, offline }: { items: LiveItem[]; fetchedAt: string | null; offline: boolean }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-bold tracking-widest text-cyan-200">Public feeds {offline ? '· stale or offline' : ''} {fetchedAt ? `· ${fetchedAt}` : ''}</h2>
      {items.map((item) => (
        <article key={item.id} className="rounded-2xl border border-slate-800 p-3 text-sm">
          <p className="text-xs font-bold uppercase text-cyan-200">Live data · {item.kind}</p>
          <p className="mt-1 font-semibold text-white">{item.title}</p>
          <p className="text-slate-300">{item.agency}. Issued {item.issuedAt || 'not published'}. Expires {item.expiresAt || 'not published'}.</p>
          <a className="text-cyan-300 underline" href={item.sourceUrl}>{item.sourceName}</a>
        </article>
      ))}
      {!items.length && <p className="text-sm text-slate-400">No live rows yet.</p>}
    </section>
  );
}

function NeedsList({ needs }: { needs: NeedsSetup[] }) {
  if (!needs.length) return null;
  return (
    <section className="rounded-2xl border border-amber-200/30 p-3 text-sm text-amber-50">
      <h2 className="font-semibold">Needs setup</h2>
      <ul className="mt-2 space-y-2">
        {needs.map((item) => <li key={item.id}>{item.env ? `${item.env}: ` : ''}{item.why}</li>)}
      </ul>
    </section>
  );
}
