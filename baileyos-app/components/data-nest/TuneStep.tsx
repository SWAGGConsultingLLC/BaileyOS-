'use client';

import React, { useState } from 'react';
import {
  EXAMPLE_PROFILES,
  GENERATION_OPTIONS,
  INTERESTS,
  type InterestId,
  type NestProfile,
  emptyProfile,
  generationLine,
  shownGeneration,
} from '@/lib/data-nest/profile';

export function TuneStep({
  initial,
  onSave,
  onSkip,
  onDelete,
}: {
  initial: NestProfile | null;
  onSave: (profile: NestProfile) => void;
  onSkip?: () => void;
  onDelete: () => void;
}) {
  const starting = initial ?? emptyProfile();
  const known = (GENERATION_OPTIONS as readonly string[]).includes(starting.selfLabel);
  const [draft, setDraft] = useState<NestProfile>(starting);
  const [yearText, setYearText] = useState(starting.birthYear ? String(starting.birthYear) : '');
  const [choice, setChoice] = useState(starting.selfLabel === '' ? '' : known ? starting.selfLabel : 'custom');
  const [custom, setCustom] = useState(known || starting.selfLabel === '' ? '' : starting.selfLabel);
  const year = Number(yearText);
  const line = Number.isInteger(year) ? generationLine(year) : null;
  const selfLabel = (choice === 'custom' ? custom : choice).trim().slice(0, 40);
  const shown = shownGeneration({ birthYear: Number.isInteger(year) ? year : null, selfLabel });
  const larger = draft.interests.includes('largerText');

  function toggle(id: InterestId) {
    setDraft(current => ({
      ...current,
      interests: current.interests.includes(id)
        ? current.interests.filter(item => item !== id)
        : [...current.interests, id],
    }));
  }

  function preview(profile: NestProfile) {
    setDraft(profile);
    setYearText(profile.birthYear ? String(profile.birthYear) : '');
    const named = (GENERATION_OPTIONS as readonly string[]).includes(profile.selfLabel);
    setChoice(profile.selfLabel === '' ? '' : named ? profile.selfLabel : 'custom');
    setCustom(named || profile.selfLabel === '' ? '' : profile.selfLabel);
  }

  function save() {
    const birthYear = yearText.trim() === '' ? null : Number(yearText);
    onSave({
      birthYear: birthYear != null && Number.isInteger(birthYear) ? birthYear : null,
      origin: draft.origin.trim().slice(0, 80),
      selfLabel,
      interests: draft.interests,
    });
  }

  const order = draft.interests.filter(id => id !== 'largerText').map(id => INTERESTS.find(item => item.id === id)?.label).filter(Boolean);

  return (
    <section className="mt-4 rounded-3xl border border-cyan-400/40 bg-[#07111f] p-4" aria-labelledby="tune-heading" style={{ fontSize: larger ? '1.25rem' : undefined }}>
      <h2 id="tune-heading" className="text-2xl font-semibold text-white">Tune it to you</h2>
      <p className="mt-2 text-slate-200">This stays on this phone. It is not sent anywhere.</p>
      <label className="mt-4 block text-slate-100" htmlFor="birth-year">Birth year</label>
      <input id="birth-year" inputMode="numeric" value={yearText} onChange={e => setYearText(e.target.value.replace(/[^\d]/g, '').slice(0, 4))} className="mt-1 min-h-12 w-full rounded-2xl border border-slate-600 bg-transparent px-3" />
      {line && <p className="mt-2 text-slate-300">Year label: {line}</p>}
      <label className="mt-4 block text-slate-100" htmlFor="self-label">What you call yourself</label>
      <select id="self-label" value={choice} onChange={e => setChoice(e.target.value)} className="mt-1 min-h-12 w-full rounded-2xl border border-slate-600 bg-[#07111f] px-3">
        <option value="">Use the year label</option>
        {GENERATION_OPTIONS.map(name => <option key={name} value={name}>{name}</option>)}
        <option value="custom">Type my own</option>
      </select>
      {choice === 'custom' && (
        <input id="self-custom" value={custom} onChange={e => setCustom(e.target.value)} placeholder="Older millennial" aria-label="Your own label" className="mt-2 min-h-12 w-full rounded-2xl border border-slate-600 bg-transparent px-3" />
      )}
      {selfLabel && <p className="mt-2 font-semibold text-white">{shown}</p>}
      <label className="mt-4 block text-slate-100" htmlFor="origin">Home region</label>
      <input id="origin" value={draft.origin} onChange={e => setDraft(current => ({ ...current, origin: e.target.value }))} placeholder="Western Colorado" className="mt-1 min-h-12 w-full rounded-2xl border border-slate-600 bg-transparent px-3" />
      <fieldset className="mt-4">
        <legend className="text-slate-100">What matters to you</legend>
        <div className="mt-2 space-y-2">
          {INTERESTS.map(item => (
            <label key={item.id} className="flex min-h-12 items-center gap-3 rounded-2xl border border-slate-700 px-3">
              <input type="checkbox" checked={draft.interests.includes(item.id)} onChange={() => toggle(item.id)} />
              {item.label}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="mt-4 text-slate-200" style={{ fontSize: larger ? '1.25rem' : '1rem' }}>
        {order.length ? `Alerts will lead with ${order.join(', ')}.` : 'Alerts stay in the usual order until you choose.'}
      </p>
      <div className="mt-4 space-y-2">
        <p className="text-sm text-slate-300">See an example. This only previews order and text size. It does not change your location.</p>
        {EXAMPLE_PROFILES.map(example => (
          <button key={example.id} type="button" className="min-h-12 w-full rounded-2xl border border-cyan-400/40 px-3 text-left text-white" onClick={() => preview(example.profile)}>{example.title}</button>
        ))}
      </div>
      <button type="button" className="mt-4 min-h-12 w-full rounded-2xl bg-cyan-300 font-semibold text-black" onClick={save}>Save on this phone</button>
      {onSkip && <button type="button" className="mt-2 min-h-12 w-full rounded-2xl border border-slate-600 text-slate-100" onClick={onSkip}>Skip for now</button>}
      <button type="button" className="mt-2 min-h-12 w-full text-slate-300 underline" onClick={onDelete}>Delete my profile</button>
    </section>
  );
}
