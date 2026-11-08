import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  authRedirectUrl,
  callbackKind,
  interpretMagicLink,
  interpretRecoverySend,
  interpretSignIn,
  interpretSignUp,
  noticeText,
  sessionIsUsable,
  validateBio,
  validateDisplayName,
  validatePassword,
} from './account.ts';

test('signup without a session asks for email confirmation', () => {
  const notice = interpretSignUp({ error: null, session: null });
  assert.equal(notice.kind, 'confirm-email');
  assert.match(noticeText(notice), /not a signed-in member/);
});

test('signup that already has a session is signed in', () => {
  assert.equal(interpretSignUp({ error: null, session: { access_token: 't' } }).kind, 'signed-in');
});

test('signup failure does not say the email is registered', () => {
  const notice = interpretSignUp({ error: { message: 'User already registered', code: 'user_already_exists' }, session: null });
  assert.equal(notice.kind, 'error');
  if (notice.kind === 'error') assert.doesNotMatch(notice.message, /already registered/i);
});

test('confirmed sign-in requires a session', () => {
  assert.equal(interpretSignIn({ error: null, session: { access_token: 't' } }).kind, 'signed-in');
  assert.equal(interpretSignIn({ error: null, session: null }).kind, 'error');
});

test('unconfirmed sign-in is not treated as success', () => {
  const notice = interpretSignIn({ error: { code: 'email_not_confirmed', message: 'Email not confirmed' }, session: null });
  assert.equal(notice.kind, 'unconfirmed');
});

test('bad password is an auth failure', () => {
  assert.equal(interpretSignIn({ error: { code: 'invalid_credentials', message: 'Invalid login credentials' }, session: null }).kind, 'invalid');
});

test('expired session is not usable', () => {
  assert.equal(sessionIsUsable({ access_token: 't', expires_at: 100 }, 100), false);
  assert.equal(sessionIsUsable({ access_token: 't', expires_at: 101 }, 100), true);
  assert.equal(sessionIsUsable(null, 100), false);
  assert.equal(noticeText({ kind: 'expired' }).includes('expired'), true);
});

test('recovery callback is recognized and a send does not claim the mailbox exists', () => {
  assert.equal(callbackKind('https://baileyos-app.vercel.app/#access_token=abc&type=recovery'), 'recovery');
  assert.equal(callbackKind('https://baileyos-app.vercel.app/?code=abc&type=recovery'), 'recovery');
  assert.equal(callbackKind('https://baileyos-app.vercel.app/#type=signup'), 'signup');
  assert.equal(callbackKind('https://baileyos-app.vercel.app/'), null);
  const sent = interpretRecoverySend({ error: null });
  assert.equal(sent.kind, 'recovery-sent');
  assert.match(noticeText(sent), /If an account exists/);
});

test('magic link does not describe itself as account creation or placement', () => {
  const sent = interpretMagicLink({ error: null });
  assert.match(noticeText(sent), /does not create a member/);
  assert.match(noticeText(sent), /does not attach a map placement/);
  assert.match(noticeText(interpretMagicLink({ error: { message: 'Signups not allowed for otp' } })), /Create an account/);
});

test('profile fields reject blanks, overflow, and control characters', () => {
  assert.equal(validateDisplayName('  ').ok, false);
  assert.equal(validateDisplayName('A'.repeat(81)).ok, false);
  assert.equal(validateDisplayName('Ada\nLovelace').ok, false);
  assert.deepEqual(validateDisplayName('  Ada  '), { ok: true, value: 'Ada' });
  assert.deepEqual(validateBio('   '), { ok: true, value: null });
  assert.equal(validateBio('x'.repeat(281)).ok, false);
  assert.equal(validateBio('hello\u0000').ok, false);
  assert.equal(validatePassword('short').ok, false);
  assert.equal(validatePassword('long-enough').ok, true);
});

test('redirect url has no trailing slash', () => {
  assert.equal(authRedirectUrl('https://baileyos-app.vercel.app/'), 'https://baileyos-app.vercel.app');
});

test('profile migration does not use security definer or user metadata', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261108142831_member_profiles.sql', import.meta.url), 'utf8');
  const executable = sql.split('\n').filter(line => !line.trim().startsWith('--')).join('\n');
  assert.doesNotMatch(executable, /language plpgsql\s+security definer/i);
  assert.doesNotMatch(executable, /user_meta|app_meta|auth\.jwt/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /force row level security/i);
  assert.match(sql, /user_id = auth\.uid\(\)/);
  assert.doesNotMatch(sql, /grant\s+delete/i);
  assert.doesNotMatch(sql, /role text/i);
});
