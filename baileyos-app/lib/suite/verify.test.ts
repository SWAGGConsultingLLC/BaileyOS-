import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { test } from 'node:test';
import { SuiteContinue, beginSuiteHref, linkedInReturnInProgress, suiteContinueLabel } from '../../components/SuiteEntrance.tsx';
import { SUITE_ISSUER, decideSuiteSubject, linkedInProviderState, linkedInProviderUnavailable, suiteAuthorizeHref, suiteCallbackMessage, suiteConfig, suiteEnabled, suiteReturnTarget } from './verify.ts';

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

const linkedInUser = {
  id: SUBJECT,
  email: 'person@example.test',
  user_metadata: { role: 'steward' },
  app_metadata: { role: 'admin' },
  identities: [{ provider: 'linkedin_oidc', identity_data: { sub: 'linkedin-sub-1', email: 'person@example.test' } }],
};

test('suite sign-in uses the map project and ignores the Data Nest project', () => {
  assert.equal(suiteEnabled({ suiteUrl: '', suiteKey: '' }), false);
  assert.equal(suiteConfig({ suiteUrl: 'https://rxckxwdvhjszzuqsvxdk.supabase.co/', suiteKey: 'publishable' })?.url, 'https://rxckxwdvhjszzuqsvxdk.supabase.co');
  assert.equal(suiteEnabled({ suiteUrl: 'https://shedpnosbkwkmwgqkefj.supabase.co', suiteKey: 'publishable' }), false);
  assert.equal(suiteEnabled({ suiteUrl: 'https://evil.example/auth', suiteKey: 'publishable' }), false);
});

test('a LinkedIn identity is accepted and metadata is not a role', () => {
  const decision = decideSuiteSubject(token(good), linkedInUser);
  assert.deepEqual(decision, { ok: true, subject: SUBJECT, providerSub: 'linkedin-sub-1' });
  assert.equal('email' in decision, false);
});

test('the auth server must agree with the token subject', () => {
  assert.equal(decideSuiteSubject(token(good), null).ok, false);
  assert.equal(decideSuiteSubject(token(good), { ...linkedInUser, id: '22222222-2222-4222-8222-222222222222' }).ok, false);
  assert.equal(decideSuiteSubject(token({ ...good, iss: 'https://shedpnosbkwkmwgqkefj.supabase.co/auth/v1' }), linkedInUser).ok, false);
  assert.equal(decideSuiteSubject(token({ ...good, role: 'service_role' }), linkedInUser).ok, false);
  assert.equal(decideSuiteSubject(token({ ...good, aud: 'anon' }), linkedInUser).ok, false);
  assert.equal(decideSuiteSubject(token(good), { id: SUBJECT, identities: [{ provider: 'email', identity_data: { sub: SUBJECT } }] }).ok, false);
  assert.equal(decideSuiteSubject(token(good), { id: SUBJECT, identities: [{ provider: 'linkedin_oidc', identity_data: { email: 'person@example.test' } }] }).ok, false);
  assert.equal(decideSuiteSubject('not-a-jwt', linkedInUser).ok, false);
});

test('a callback explains a missing verifier, a provider error, and a session that never reached this site', async () => {
  const missing = suiteCallbackMessage({
    search: '?code=returned-code',
    exchangeError: 'PKCE code verifier not found in storage. This can happen if the auth flow was initiated in a different browser or device.',
    hasSession: false,
  });
  assert.equal(missing.kind, 'error');
  assert.match(missing.message, /this browser does not have the sign-in check/);
  assert.match(missing.message, /Safari or Chrome/);
  const mismatch = suiteCallbackMessage({
    search: '?code=returned-code',
    exchangeError: 'code challenge does not match previously saved code verifier',
    hasSession: false,
  });
  assert.equal(mismatch.kind, 'error');
  assert.match(mismatch.message, /started more than once/);
  assert.equal(linkedInReturnInProgress('https://baileyos-app.vercel.app/suite?code=abc'), true);
  assert.equal(linkedInReturnInProgress('https://baileyos-app.vercel.app/?code=abc'), true);
  assert.equal(linkedInReturnInProgress('https://baileyos-app.vercel.app/#access_token=abc'), false);
  let calls = 0;
  const redirectTo = 'https://baileyos-app.vercel.app/suite#once';
  const start = async () => {
    calls += 1;
    return { href: 'https://rxckxwdvhjszzuqsvxdk.supabase.co/auth/v1/authorize?provider=linkedin_oidc' };
  };
  const first = beginSuiteHref(redirectTo, start);
  const second = beginSuiteHref(redirectTo, start);
  assert.equal(first, second);
  assert.equal(calls, 1);
  assert.equal((await first).href, (await second).href);
  const denied = suiteCallbackMessage({
    search: '?error=access_denied&error_description=The+user+cancelled',
    hasSession: false,
  });
  assert.equal(denied.kind, 'error');
  assert.match(denied.message, /did not finish/);
  assert.match(denied.message, /cancelled/);
  const elsewhere = suiteCallbackMessage({ search: '', hasSession: false });
  assert.equal(elsewhere.kind, 'pending');
  assert.match(elsewhere.message, /360 website does not count/);
  const ready = suiteCallbackMessage({ search: '', hasSession: true });
  assert.equal(ready.kind, 'ready');
});

test('a disabled LinkedIn provider is coming soon, and a redirect means it is ready', async () => {
  assert.equal(linkedInProviderUnavailable(400, 'Unsupported provider: provider is not enabled'), true);
  const config = { url: 'https://rxckxwdvhjszzuqsvxdk.supabase.co', publishableKey: 'publishable' };
  const soon = await linkedInProviderState(config, async () => new Response('provider is not enabled', { status: 400 }));
  assert.equal(soon, 'soon');
  const ready = await linkedInProviderState(config, async () => new Response(null, { status: 302, headers: { location: 'https://www.linkedin.com/oauth' } }));
  assert.equal(ready, 'ready');
});

test('a code that lands on the map root is sent to /suite', () => {
  assert.equal(suiteReturnTarget('https://baileyos-app.vercel.app/?code=abc'), '/suite?code=abc');
  assert.equal(suiteReturnTarget('https://baileyos-app.vercel.app/suite?code=abc'), null);
  assert.equal(suiteReturnTarget('https://baileyos-app.vercel.app/#access_token=abc&type=signup'), null);
  assert.equal(suiteReturnTarget('https://baileyos-app.vercel.app/?code=abc#access_token=abc'), null);
});

test('only a map LinkedIn authorize link that returns to /suite or /data-nest is kept', () => {
  const config = { url: 'https://rxckxwdvhjszzuqsvxdk.supabase.co', publishableKey: 'publishable' };
  const good = 'https://rxckxwdvhjszzuqsvxdk.supabase.co/auth/v1/authorize?provider=linkedin_oidc&scopes=openid+profile+email&redirect_to=https%3A%2F%2Fbaileyos-app.vercel.app%2Fsuite';
  const nest = 'https://rxckxwdvhjszzuqsvxdk.supabase.co/auth/v1/authorize?provider=linkedin_oidc&redirect_to=https%3A%2F%2Fbaileyos-app.vercel.app%2Fdata-nest';
  assert.equal(suiteAuthorizeHref(good, config), good);
  assert.equal(suiteAuthorizeHref(nest, config), nest);
  assert.equal(suiteAuthorizeHref('https://rxckxwdvhjszzuqsvxdk.supabase.co/auth/v1/authorize?provider=custom:app-oidc&redirect_to=https://baileyos-app.vercel.app/suite', config), null);
  assert.equal(suiteAuthorizeHref('https://shedpnosbkwkmwgqkefj.supabase.co/auth/v1/authorize?provider=linkedin_oidc&redirect_to=https://baileyos-app.vercel.app/suite', config), null);
  assert.equal(suiteAuthorizeHref('https://rxckxwdvhjszzuqsvxdk.supabase.co/auth/v1/authorize?provider=github&redirect_to=https://baileyos-app.vercel.app/suite', config), null);
  assert.equal(suiteAuthorizeHref('https://rxckxwdvhjszzuqsvxdk.supabase.co/auth/v1/authorize?provider=linkedin_oidc&redirect_to=https://baileyos-app.vercel.app/workspace', config), null);
});

test('the suite entrance does not render a connected control while config is absent', () => {
  const src = readFileSync(new URL('../../components/SuiteEntrance.tsx', import.meta.url), 'utf8');
  assert.match(src, /SuiteContinue/);
  assert.match(src, /<a href=\{phase.href\}/);
  assert.match(src, /provider: SUITE_LINKEDIN_PROVIDER/);
  assert.match(src, /scopes: SUITE_SCOPES/);
  assert.match(readFileSync(new URL('./verify.ts', import.meta.url), 'utf8'), /openid profile email/);
  assert.doesNotMatch(src, /custom:app-oidc/);
  assert.match(src, /signInWithOAuth\.bind\(client\.auth\)/);
  assert.match(src, /skipBrowserRedirect: true/);
  assert.match(src, /Do not choose Sign up/);
  assert.match(src, /SuiteBadge/);
  assert.doesNotMatch(src, /Connected/);
  assert.match(src, /window\.location\.origin \+ '\/suite'/);
  assert.doesNotMatch(src, /window\.location\.assign/);
  assert.doesNotMatch(src, /window\.location\.href\s*=/);
});

test('a signed-in steward opens the report instead of starting LinkedIn again', () => {
  assert.equal(suiteContinueLabel('/steward'), 'Open the Steward Consensus Report');
  assert.equal(suiteContinueLabel('/brewing'), 'Open 360° Brewing');
  const markup = renderToStaticMarkup(createElement(SuiteContinue, {
    phase: { state: 'ready', href: '/steward' },
    status: { recorded: true, steward: true },
  }));
  assert.match(markup, /Open the Steward Consensus Report/);
  assert.doesNotMatch(markup, /authorize/);
  const member = renderToStaticMarkup(createElement(SuiteContinue, {
    phase: { state: 'ready', href: '/brewing' },
    status: { recorded: true, steward: false },
  }));
  assert.match(member, /Open 360° Brewing/);
  assert.doesNotMatch(member, /authorize/);
});

test('the continue control is a link only after the address is ready', () => {
  const preparing = renderToStaticMarkup(createElement(SuiteContinue, { phase: { state: 'preparing' } }));
  assert.match(preparing, /Preparing the 360° Brewing sign-in/);
  assert.doesNotMatch(preparing, /<a /);
  const href = 'https://rxckxwdvhjszzuqsvxdk.supabase.co/auth/v1/authorize?provider=linkedin_oidc&redirect_to=https%3A%2F%2Fbaileyos-app.vercel.app%2Fsuite';
  const ready = renderToStaticMarkup(createElement(SuiteContinue, { phase: { state: 'ready', href } }));
  assert.match(ready, /<a href="https:\/\/rxckxwdvhjszzuqsvxdk\.supabase\.co\/auth\/v1\/authorize\?provider=linkedin_oidc/);
  assert.match(ready, /Continue to 360° Brewing/);
  const failed = renderToStaticMarkup(createElement(SuiteContinue, { phase: { state: 'error', message: 'Could not prepare the 360° Brewing sign-in.' } }));
  assert.match(failed, /role="alert"/);
  assert.doesNotMatch(failed, /<a /);
});
