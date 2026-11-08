'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import {
  authRedirectUrl,
  decideSessionExposure,
  hasRecoveryCredential,
  interpretMagicLink,
  interpretRecoverySend,
  interpretSignIn,
  interpretSignUp,
  noticeText,
  stripAuthParams,
  validateBio,
  validateDisplayName,
  validatePassword,
  type AuthNotice,
} from '@/lib/account';

type Mode = 'signup' | 'signin' | 'recover';
const PENDING_NAME = 'baileyos_pending_display_name';

export function AccountPanel({
  client,
  onAccessToken,
}: {
  client: SupabaseClient | null;
  onAccessToken: (token: string | null) => void;
}) {
  const [mode, setMode] = useState<Mode>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [settingPassword, setSettingPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<AuthNotice | null>(null);
  const [savedName, setSavedName] = useState<string | null>(null);
  const [dropUnconfirmed, setDropUnconfirmed] = useState(false);
  const hrefAtLoad = useState(() => (typeof window === 'undefined' ? '' : window.location.href))[0];
  const recoveryRef = useRef(hasRecoveryCredential(hrefAtLoad));

  function applySession(event: string | null, session: Session | null) {
    if (event === 'PASSWORD_RECOVERY') recoveryRef.current = true;
    const decision = decideSessionExposure({
      event,
      recoveryPending: recoveryRef.current,
      session,
      nowSec: Math.floor(Date.now() / 1000),
    });
    if (decision.dropUnconfirmed) {
      setDropUnconfirmed(true);
      onAccessToken(null);
      setUserId(null);
      setSettingPassword(false);
      setNotice({ kind: 'unconfirmed' });
      return;
    }
    setSettingPassword(decision.resetPassword);
    onAccessToken(decision.exposeToken);
    setUserId(decision.userId);
  }

  useEffect(() => {
    if (!dropUnconfirmed || !client) return;
    let cancel = false;
    client.auth.signOut().finally(() => { if (!cancel) setDropUnconfirmed(false); });
    return () => { cancel = true; };
  }, [dropUnconfirmed, client]);

  useEffect(() => {
    if (typeof window === 'undefined' || !hrefAtLoad) return;
    const clean = stripAuthParams(window.location.href);
    if (clean !== window.location.href) window.history.replaceState(null, '', clean);
  }, [hrefAtLoad]);

  useEffect(() => {
    if (!client) return;
    let stop = false;
    client.auth.getSession().then(({ data }) => { if (!stop) applySession(null, data.session); }).catch(() => {
      if (stop) return;
      onAccessToken(null);
      setUserId(null);
      setNotice({ kind: 'expired' });
    });
    const { data: sub } = client.auth.onAuthStateChange((event, session) => {
      if (stop) return;
      if (event === 'SIGNED_OUT') {
        onAccessToken(null);
        setUserId(null);
        setSettingPassword(false);
        setSavedName(null);
        return;
      }
      applySession(event, session);
    });
    return () => { stop = true; sub.subscription.unsubscribe(); };
  }, [client, onAccessToken]);

  useEffect(() => {
    if (!client || !userId) return;
    let stop = false;
    client.from('profiles').select('display_name, bio').eq('user_id', userId).maybeSingle().then(({ data, error }) => {
      if (stop || error || !data) return;
      setDisplayName(data.display_name || '');
      setBio(data.bio || '');
      setSavedName(data.display_name || null);
    });
    try {
      const pending = sessionStorage.getItem(PENDING_NAME);
      if (pending) setDisplayName(current => current || pending);
    } catch { /* private mode */ }
    return () => { stop = true; };
  }, [client, userId]);

  async function onSignUp(e: FormEvent) {
    e.preventDefault();
    if (!client) return;
    const name = validateDisplayName(displayName);
    const pass = validatePassword(password);
    if (!name.ok) { setNotice({ kind: 'error', message: name.error }); return; }
    if (!pass.ok) { setNotice({ kind: 'error', message: pass.error }); return; }
    setBusy(true);
    const { data, error } = await client.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: authRedirectUrl(window.location.origin) },
    });
    setBusy(false);
    setPassword('');
    const result = interpretSignUp({ error, session: data.session, emailConfirmedAt: data.user?.email_confirmed_at });
    if (result.kind === 'confirm-email' && data.session) setDropUnconfirmed(true);
    setNotice(result);
    if (result.kind === 'confirm-email') {
      try { sessionStorage.setItem(PENDING_NAME, name.value); } catch { /* ignore */ }
      setDisplayName(name.value);
    }
  }

  async function onSignIn(e: FormEvent) {
    e.preventDefault();
    if (!client) return;
    setBusy(true);
    const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    setPassword('');
    const result = interpretSignIn({ error, session: data.session, emailConfirmedAt: data.user?.email_confirmed_at });
    if (result.kind === 'unconfirmed') setDropUnconfirmed(true);
    setNotice(result);
  }

  async function onResend() {
    if (!client || !email.trim()) return;
    setBusy(true);
    const { error } = await client.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: authRedirectUrl(window.location.origin) },
    });
    setBusy(false);
    setNotice(error
      ? { kind: 'error', message: 'Could not resend the confirmation message.' }
      : { kind: 'confirm-email' });
  }

  async function onRecover(e: FormEvent) {
    e.preventDefault();
    if (!client) return;
    setBusy(true);
    const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: authRedirectUrl(window.location.origin),
    });
    setBusy(false);
    setNotice(interpretRecoverySend({ error }));
  }

  async function onMagicLink() {
    if (!client || !email.trim()) return;
    setBusy(true);
    const { error } = await client.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: authRedirectUrl(window.location.origin),
        shouldCreateUser: false,
      },
    });
    setBusy(false);
    setNotice(interpretMagicLink({ error }));
  }

  async function onNewPassword(e: FormEvent) {
    e.preventDefault();
    if (!client) return;
    const pass = validatePassword(password);
    if (!pass.ok) { setNotice({ kind: 'error', message: pass.error }); return; }
    setBusy(true);
    const { error } = await client.auth.updateUser({ password });
    setBusy(false);
    setPassword('');
    if (error) { setNotice({ kind: 'error', message: 'Could not update the password. The recovery session was not given other access.' }); return; }
    recoveryRef.current = false;
    setSettingPassword(false);
    const { data } = await client.auth.getSession();
    applySession('USER_UPDATED', data.session);
    setNotice({ kind: 'password-updated' });
  }

  async function onSaveProfile(e: FormEvent) {
    e.preventDefault();
    if (!client || !userId) return;
    const name = validateDisplayName(displayName);
    const about = validateBio(bio);
    if (!name.ok) { setNotice({ kind: 'error', message: name.error }); return; }
    if (!about.ok) { setNotice({ kind: 'error', message: about.error }); return; }
    setBusy(true);
    const { error } = await client.from('profiles').upsert(
      { user_id: userId, display_name: name.value, bio: about.value },
      { onConflict: 'user_id' }
    );
    setBusy(false);
    if (error) { setNotice({ kind: 'error', message: 'Could not save the profile.' }); return; }
    setSavedName(name.value);
    try { sessionStorage.removeItem(PENDING_NAME); } catch { /* ignore */ }
    setNotice({ kind: 'signed-in' });
  }

  async function onSignOut() {
    if (!client) return;
    setBusy(true);
    await client.auth.signOut();
    setBusy(false);
    onAccessToken(null);
    setUserId(null);
    setSavedName(null);
    setSettingPassword(false);
    setNotice(null);
  }

  if (!client) {
    return (
      <section className="mt-6 rounded-2xl border border-gray-800 p-4" aria-labelledby="account-heading">
        <h2 id="account-heading" className="text-sm font-bold tracking-widest text-gray-400">ACCOUNT</h2>
        <p className="mt-2 text-sm text-gray-400">Sign-in is not configured in this environment. You can still share a place without an account.</p>
      </section>
    );
  }

  return (
    <section className="mt-6 rounded-2xl border border-gray-800 p-4" aria-labelledby="account-heading">
      <h2 id="account-heading" className="text-sm font-bold tracking-widest text-gray-400">ACCOUNT</h2>
      <p className="mt-2 text-sm text-gray-400">Optional. The map does not require a member. A profile is private to you and is not joined to a placement by email.</p>

      {notice && <p className="mt-3 text-sm text-gray-200" role="status">{noticeText(notice)}</p>}

      {userId && settingPassword && (
        <form onSubmit={onNewPassword} className="mt-4 grid gap-2">
          <label className="text-xs text-gray-400" htmlFor="new-password">New password</label>
          <input id="new-password" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} className="rounded-lg border border-gray-700 bg-transparent px-3 py-2" required />
          <button disabled={busy} className="rounded-full bg-cyanx py-3 font-semibold text-black disabled:opacity-60">Save new password</button>
        </form>
      )}

      {userId && !settingPassword && (
        <form onSubmit={onSaveProfile} className="mt-4 grid gap-2">
          <p className="text-sm text-gray-300">{savedName ? `Private profile: ${savedName}` : 'Signed in. Save a display name. It is not shown on the map.'}</p>
          <label className="text-xs text-gray-400" htmlFor="display-name">Display name</label>
          <input id="display-name" value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={80} className="rounded-lg border border-gray-700 bg-transparent px-3 py-2" required />
          <label className="text-xs text-gray-400" htmlFor="bio">Short bio, optional</label>
          <textarea id="bio" value={bio} onChange={e => setBio(e.target.value)} maxLength={280} rows={3} className="rounded-lg border border-gray-700 bg-transparent px-3 py-2" />
          <button disabled={busy} className="rounded-full bg-cyanx py-3 font-semibold text-black disabled:opacity-60">Save private profile</button>
          <button type="button" onClick={onSignOut} disabled={busy} className="rounded-full border border-gray-600 py-3 font-semibold text-gray-200">Sign out</button>
        </form>
      )}

      {!userId && (
        <div className="mt-4">
          <div className="flex gap-2" role="tablist" aria-label="Account actions">
            {(['signup', 'signin', 'recover'] as Mode[]).map(item => (
              <button key={item} type="button" role="tab" aria-selected={mode === item} onClick={() => { setMode(item); setNotice(null); }} className={`rounded-full px-3 py-1 text-xs font-semibold ${mode === item ? 'bg-cyanx text-black' : 'border border-gray-700 text-gray-300'}`}>
                {item === 'signup' ? 'Create account' : item === 'signin' ? 'Sign in' : 'Reset password'}
              </button>
            ))}
          </div>

          {mode === 'signup' && (
            <form onSubmit={onSignUp} className="mt-3 grid gap-2">
              <label className="text-xs text-gray-400" htmlFor="signup-email">Email</label>
              <input id="signup-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required className="rounded-lg border border-gray-700 bg-transparent px-3 py-2" />
              <label className="text-xs text-gray-400" htmlFor="signup-password">Password</label>
              <input id="signup-password" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} required className="rounded-lg border border-gray-700 bg-transparent px-3 py-2" />
              <label className="text-xs text-gray-400" htmlFor="signup-name">Display name</label>
              <input id="signup-name" value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={80} required className="rounded-lg border border-gray-700 bg-transparent px-3 py-2" />
              <button disabled={busy} className="rounded-full bg-cyanx py-3 font-semibold text-black disabled:opacity-60">Create account</button>
              <p className="text-xs text-gray-500">You must open the confirmation email before signing in. This does not place you on the map.</p>
              <button type="button" onClick={onResend} disabled={busy} className="text-left text-xs font-semibold text-cyanx">Resend confirmation email</button>
            </form>
          )}

          {mode === 'signin' && (
            <form onSubmit={onSignIn} className="mt-3 grid gap-2">
              <label className="text-xs text-gray-400" htmlFor="signin-email">Email</label>
              <input id="signin-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required className="rounded-lg border border-gray-700 bg-transparent px-3 py-2" />
              <label className="text-xs text-gray-400" htmlFor="signin-password">Password</label>
              <input id="signin-password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required className="rounded-lg border border-gray-700 bg-transparent px-3 py-2" />
              <button disabled={busy} className="rounded-full bg-cyanx py-3 font-semibold text-black disabled:opacity-60">Sign in</button>
              <button type="button" onClick={onMagicLink} disabled={busy} className="text-left text-xs font-semibold text-cyanx">Email a sign-in link to an existing account</button>
            </form>
          )}

          {mode === 'recover' && (
            <form onSubmit={onRecover} className="mt-3 grid gap-2">
              <label className="text-xs text-gray-400" htmlFor="recover-email">Email</label>
              <input id="recover-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required className="rounded-lg border border-gray-700 bg-transparent px-3 py-2" />
              <button disabled={busy} className="rounded-full bg-cyanx py-3 font-semibold text-black disabled:opacity-60">Send recovery link</button>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
