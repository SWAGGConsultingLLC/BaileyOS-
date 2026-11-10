'use client';

import React, { useEffect, useState } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { validateDisplayName } from '@/lib/account';
import { linkedInPresentation, visibleIdentity, type ProfileVisibility } from '@/lib/identity';
import { suiteConfig } from '@/lib/suite/verify';

type Status = { recorded: boolean; steward: boolean };

function suiteClient(): SupabaseClient | null {
  const config = suiteConfig();
  if (!config) return null;
  return createClient(config.url, config.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce' },
  });
}

export function SuiteIdentity({ onStatus }: { onStatus?: (status: Status | null) => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [linkedIn, setLinkedIn] = useState<{ name: string | null; picture: string | null }>({ name: null, picture: null });
  const [profile, setProfile] = useState<ProfileVisibility | null>(null);
  const [draftName, setDraftName] = useState('');
  const [showName, setShowName] = useState(true);
  const [showPhoto, setShowPhoto] = useState(true);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState('');
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const client = suiteClient();
    if (!client) return;
    let cancel = false;
    client.auth.getSession().then(async ({ data }) => {
      const token = data.session?.access_token;
      if (!token || cancel) return;
      const res = await fetch('/api/suite', { method: 'POST', headers: { authorization: `Bearer ${token}` } });
      const body = await res.json().catch(() => ({}));
      if (cancel || !res.ok || body.recorded !== true) return;
      const next = { recorded: true, steward: body.steward === true };
      setStatus(next);
      onStatus?.(next);
      const userResult = await client.auth.getUser(token);
      const user = userResult.data.user;
      if (!user || cancel) return;
      setUserId(user.id);
      const identity = user.identities?.find(item => item.provider === 'linkedin_oidc');
      const presentation = linkedInPresentation(identity?.identity_data);
      setLinkedIn(presentation);
      const saved = await client.from('profiles').select('display_name, show_name, show_photo').eq('user_id', user.id).maybeSingle();
      if (cancel || saved.error || !saved.data) {
        setDraftName(presentation.name || '');
        return;
      }
      const row = {
        displayName: saved.data.display_name,
        showName: saved.data.show_name !== false,
        showPhoto: saved.data.show_photo !== false,
      };
      setProfile(row);
      setDraftName(row.displayName);
      setShowName(row.showName);
      setShowPhoto(row.showPhoto);
    }).catch(() => undefined);
    return () => { cancel = true; };
  }, [onStatus]);

  if (!status?.recorded) return null;
  const visible = visibleIdentity(linkedIn, profile);
  const role = status.steward ? 'Steward' : 'Member';

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const client = suiteClient();
    const name = validateDisplayName(draftName);
    if (!client || !userId) return;
    if (!name.ok) {
      setNotice(name.error);
      return;
    }
    const { error } = await client.from('profiles').upsert(
      { user_id: userId, display_name: name.value, show_name: showName, show_photo: showPhoto },
      { onConflict: 'user_id' },
    );
    if (error) {
      setNotice('The profile could not be saved.');
      return;
    }
    setProfile({ displayName: name.value, showName, showPhoto });
    setEditing(false);
    setNotice('Saved on this account.');
  }

  async function signOut() {
    const client = suiteClient();
    await client?.auth.signOut();
    setStatus(null);
    onStatus?.(null);
  }

  return (
    <section className="mt-4 rounded-2xl border border-gray-800 p-4" aria-label="Signed in">
      <div className="flex items-center gap-3">
        {visible.picture && <img src={visible.picture} alt="" className="h-12 w-12 rounded-full object-cover" />}
        <div>
          {visible.name && <p className="text-lg font-semibold text-white">{visible.name}</p>}
          <p className="text-sm font-semibold text-amber-100">{role}</p>
        </div>
      </div>
      <div className="mt-3 flex gap-3">
        <button type="button" onClick={() => setEditing(value => !value)} className="min-h-11 font-semibold text-cyan-300 underline">Edit what shows</button>
        <button type="button" onClick={signOut} className="min-h-11 font-semibold text-gray-300 underline">Sign out</button>
      </div>
      {editing && (
        <form onSubmit={save} className="mt-3 space-y-3">
          <label className="block text-sm text-gray-300">
            Display name
            <input value={draftName} onChange={event => setDraftName(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-700 bg-black px-3 py-3 text-white" autoComplete="nickname" />
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm text-gray-200">
            <input type="checkbox" checked={showName} onChange={event => setShowName(event.target.checked)} />
            Show my name
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm text-gray-200">
            <input type="checkbox" checked={showPhoto} onChange={event => setShowPhoto(event.target.checked)} />
            Show my photo
          </label>
          <button type="submit" className="min-h-11 rounded-lg bg-white px-4 font-semibold text-black">Save</button>
        </form>
      )}
      {notice && <p className="mt-2 text-sm text-gray-300">{notice}</p>}
    </section>
  );
}
