import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { test } from 'node:test';
import { PasswordField } from '../components/AccountPanel.tsx';
import {
  authRedirectUrl,
  callbackKind,
  decideSessionExposure,
  interpretMagicLink,
  interpretRecoverySend,
  interpretResend,
  interpretSignIn,
  interpretSignUp,
  noticeText,
  sessionIsUsable,
  validateBio,
  validateDisplayName,
  validatePassword,
} from './account.ts';

test('signup without a session asks for email confirmation without claiming delivery', () => {
  const notice = interpretSignUp({ error: null, session: null });
  assert.equal(notice.kind, 'confirm-email');
  assert.match(noticeText(notice), /does not by itself mean a new message was delivered/);
  assert.doesNotMatch(noticeText(notice), /already has an account/);
});

test('signup that already has a session is signed in only when the email is confirmed', () => {
  assert.equal(interpretSignUp({ error: null, session: { access_token: 't' }, emailConfirmedAt: '2024-01-01T00:00:00Z' }).kind, 'signed-in');
  assert.equal(interpretSignUp({ error: null, session: { access_token: 't' }, emailConfirmedAt: null }).kind, 'confirm-email');
});

test('an empty identity list uses the same confirmation step and does not reveal the address', () => {
  const hidden = interpretSignUp({ error: null, session: null, identities: [] });
  const fresh = interpretSignUp({ error: null, session: null, identities: [{ provider: 'email' }] });
  assert.equal(hidden.kind, 'confirm-email');
  assert.equal(fresh.kind, 'confirm-email');
  assert.equal(noticeText(hidden), noticeText(fresh));
  assert.doesNotMatch(noticeText(hidden), /already has an account|was delivered to/);
});

test('resend reports a rate limit and does not treat generic success as delivery', () => {
  const sent = interpretResend({ error: null });
  assert.equal(sent.kind, 'resend-accepted');
  assert.match(noticeText(sent), /does not confirm that a new message was delivered/);
  assert.doesNotMatch(noticeText(sent), /already has an account/);
  const exists = interpretResend({ error: { code: 'email_exists', message: 'A user with this email address has already been registered' } });
  assert.equal(exists.kind, 'resend-accepted');
  const limited = interpretResend({ error: { code: 'over_email_send_rate_limit', status: 429, message: 'email rate limit exceeded' } });
  assert.equal(limited.kind, 'error');
  if (limited.kind === 'error') {
    assert.match(limited.message, /email rate limit exceeded/);
    assert.match(limited.message, /limited/);
  }
});

test('signup failure does not say the email is registered', () => {
  const notice = interpretSignUp({ error: { message: 'User already registered', code: 'user_already_exists' }, session: null });
  assert.equal(notice.kind, 'error');
  if (notice.kind === 'error') assert.doesNotMatch(notice.message, /already registered/i);
});

test('confirmed sign-in requires a session and a confirmation timestamp', () => {
  assert.equal(interpretSignIn({ error: null, session: { access_token: 't' }, emailConfirmedAt: '2024-01-01T00:00:00Z' }).kind, 'signed-in');
  assert.equal(interpretSignIn({ error: null, session: { access_token: 't' }, emailConfirmedAt: null }).kind, 'unconfirmed');
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
  assert.equal(callbackKind('https://baileyos-app.vercel.app/?type=recovery'), null);
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

test('redirect url is origin only', () => {
  assert.equal(authRedirectUrl('https://baileyos-app.vercel.app/'), 'https://baileyos-app.vercel.app');
  assert.equal(authRedirectUrl('https://baileyos-app.vercel.app/phish?next=https://evil.example'), 'https://baileyos-app.vercel.app');
  assert.throws(() => authRedirectUrl('javascript:alert(1)'));
});

const confirmed = { access_token: 't', expires_at: 500, user: { id: 'user-a', email_confirmed_at: '2024-01-01T00:00:00Z' } };

test('recovery session cannot link a placement until the password is replaced', () => {
  const recovery = decideSessionExposure({ event: 'PASSWORD_RECOVERY', recoveryPending: true, session: confirmed, nowSec: 100 });
  assert.equal(recovery.exposeToken, null);
  assert.equal(recovery.resetPassword, true);
  assert.equal(recovery.userId, 'user-a');
  const after = decideSessionExposure({ event: 'USER_UPDATED', recoveryPending: false, session: confirmed, nowSec: 100 });
  assert.equal(after.exposeToken, 't');
  assert.equal(after.resetPassword, false);
});

test('a bare recovery query does not demote an existing confirmed session', () => {
  const normal = decideSessionExposure({ event: 'SIGNED_IN', recoveryPending: false, session: confirmed, nowSec: 100 });
  assert.equal(normal.exposeToken, 't');
  assert.equal(normal.resetPassword, false);
});

test('an unconfirmed session is dropped and not exposed', () => {
  const dropped = decideSessionExposure({
    event: 'SIGNED_IN',
    recoveryPending: false,
    session: { access_token: 't', expires_at: 500, user: { id: 'user-a', email_confirmed_at: null } },
    nowSec: 100,
  });
  assert.equal(dropped.dropUnconfirmed, true);
  assert.equal(dropped.exposeToken, null);
});

test('the account panel uses the session decision instead of a bare recovery query', () => {
  const src = readFileSync(new URL('../components/AccountPanel.tsx', import.meta.url), 'utf8');
  assert.match(src, /decideSessionExposure\(/);
  assert.match(src, /hasRecoveryCredential\(/);
  assert.doesNotMatch(src, /callbackKind\(window\.location\.href\)/);
  assert.doesNotMatch(src, /onAccessToken\(session\.access_token\)/);
  assert.match(src, /Show password/);
  assert.match(src, /aria-pressed/);
  assert.match(src, /autoComplete="new-password"/);
  assert.match(src, /autoComplete="current-password"/);
  assert.match(src, /Confirm this address/);
  assert.match(src, /Go to sign in/);
  assert.match(src, /Edit address/);
  assert.doesNotMatch(src, /sessionStorage\.setItem\([^)]*password/i);
  assert.doesNotMatch(src, /localStorage/);
});

test('the password field starts masked and can be shown without a second entry', () => {
  const html = renderToStaticMarkup(createElement(PasswordField, {
    id: 'signup-password',
    label: 'Password',
    autoComplete: 'new-password',
    value: 'correct horse',
    onChange: () => undefined,
  }));
  assert.match(html, /type="password"/);
  assert.match(html, /auto[Cc]omplete="new-password"/);
  assert.match(html, /aria-pressed="false"/);
  assert.match(html, /Show password/);
  assert.doesNotMatch(html, /type="text"/);
  assert.match(html, /value="correct horse"/);
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
