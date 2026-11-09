import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { test } from 'node:test';
import { SuiteContinue } from '../../components/SuiteEntrance.tsx';
import { SUITE_ISSUER, decideSuiteSubject, suiteAuthorizeHref, suiteConfig, suiteEnabled, suiteReturnTarget } from './verify.ts';

const SUBJECT = '11111111-1111-4111-8111-111111111111';

function token(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${header}.${body}.sig`;
}

const good = {
  iss: SUITE_ISSUER,
  aud: 'authenticated',
  sub: SUBJECT,
  role: 'authenticated',
  email: 'person@example.test',
  user_metadata: { role: 'steward' },
};

test('suite sign-in stays off without the 360 project key', () => {
  assert.equal(suiteEnabled({ suiteUrl: '', suiteKey: '' }), false);
  assert.equal(suiteEnabled({ suiteUrl: 'https://rxckxwdvhjszzuqsvxdk.supabase.co', suiteKey: 'publishable' }), false);
  assert.equal(suiteEnabled({ suiteUrl: 'https://evil.example/auth', suiteKey: 'publishable' }), false);
  assert.equal(suiteConfig({ suiteUrl: 'https://shedpnosbkwkmwgqkefj.supabase.co/', suiteKey: 'publishable' })?.url, 'https://shedpnosbkwkmwgqkefj.supabase.co');
});

test('a verified 360 user id is accepted and metadata is not a role', () => {
  const decision = decideSuiteSubject(token(good), {
    id: SUBJECT,
    email: 'person@example.test',
    user_metadata: { role: 'steward' },
    app_metadata: { role: 'admin' },
  });
  assert.deepEqual(decision, { ok: true, subject: SUBJECT });
  assert.equal('email' in decision, false);
});

test('the auth server must agree with the token subject', () => {
  assert.equal(decideSuiteSubject(token(good), null).ok, false);
  assert.equal(decideSuiteSubject(token(good), { id: '22222222-2222-4222-8222-222222222222' }).ok, false);
  assert.equal(decideSuiteSubject(token({ ...good, iss: 'https://rxckxwdvhjszzuqsvxdk.supabase.co/auth/v1' }), { id: SUBJECT }).ok, false);
  assert.equal(decideSuiteSubject(token({ ...good, role: 'service_role' }), { id: SUBJECT }).ok, false);
  assert.equal(decideSuiteSubject(token({ ...good, aud: 'anon' }), { id: SUBJECT }).ok, false);
  assert.equal(decideSuiteSubject('not-a-jwt', { id: SUBJECT }).ok, false);
});

test('a code that lands on the map root is sent to /suite', () => {
  assert.equal(suiteReturnTarget('https://baileyos-app.vercel.app/?code=abc'), '/suite?code=abc');
  assert.equal(suiteReturnTarget('https://baileyos-app.vercel.app/suite?code=abc'), null);
  assert.equal(suiteReturnTarget('https://baileyos-app.vercel.app/#access_token=abc&type=signup'), null);
  assert.equal(suiteReturnTarget('https://baileyos-app.vercel.app/?code=abc#access_token=abc'), null);
});

test('only a 360 authorize link that returns to this map is kept', () => {
  const config = { url: 'https://shedpnosbkwkmwgqkefj.supabase.co', publishableKey: 'publishable' };
  const good = 'https://shedpnosbkwkmwgqkefj.supabase.co/auth/v1/authorize?provider=custom%3Aapp-oidc&redirect_to=https%3A%2F%2Fbaileyos-app.vercel.app%2Fsuite';
  assert.equal(suiteAuthorizeHref(good, config), good);
  assert.equal(suiteAuthorizeHref('https://evil.example/auth/v1/authorize?provider=custom:app-oidc&redirect_to=https://baileyos-app.vercel.app/suite', config), null);
  assert.equal(suiteAuthorizeHref('https://shedpnosbkwkmwgqkefj.supabase.co/auth/v1/authorize?provider=github&redirect_to=https://baileyos-app.vercel.app/suite', config), null);
  assert.equal(suiteAuthorizeHref('https://shedpnosbkwkmwgqkefj.supabase.co/auth/v1/authorize?provider=custom:app-oidc&redirect_to=https://baileyos-app.vercel.app/workspace', config), null);
});

test('the suite entrance does not render a connected control while config is absent', () => {
  const src = readFileSync(new URL('../../components/SuiteEntrance.tsx', import.meta.url), 'utf8');
  assert.match(src, /SuiteContinue/);
  assert.match(src, /<a href=\{phase.href\}/);
  assert.match(src, /signInWithOAuth\.bind\(client\.auth\)/);
  assert.match(src, /skipBrowserRedirect: true/);
  assert.match(src, /Do not choose Sign up/);
  assert.match(src, /SuiteBadge/);
  assert.doesNotMatch(src, /Connected/);
  assert.match(src, /window\.location\.origin \+ '\/suite'/);
  assert.doesNotMatch(src, /window\.location\.(assign|href)/);
});

test('the continue control is a link only after the address is ready', () => {
  const preparing = renderToStaticMarkup(createElement(SuiteContinue, { phase: { state: 'preparing' } }));
  assert.match(preparing, /Preparing the 360° Brewing sign-in/);
  assert.doesNotMatch(preparing, /<a /);
  const href = 'https://shedpnosbkwkmwgqkefj.supabase.co/auth/v1/authorize?provider=custom%3Aapp-oidc&redirect_to=https%3A%2F%2Fbaileyos-app.vercel.app%2Fsuite';
  const ready = renderToStaticMarkup(createElement(SuiteContinue, { phase: { state: 'ready', href } }));
  assert.match(ready, /<a href="https:\/\/shedpnosbkwkmwgqkefj\.supabase\.co\/auth\/v1\/authorize\?provider=custom%3Aapp-oidc/);
  assert.match(ready, /Continue to 360° Brewing/);
  const failed = renderToStaticMarkup(createElement(SuiteContinue, { phase: { state: 'error', message: 'Could not prepare the 360° Brewing sign-in.' } }));
  assert.match(failed, /role="alert"/);
  assert.doesNotMatch(failed, /<a /);
});
