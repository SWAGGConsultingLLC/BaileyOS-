import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { SUITE_ISSUER, decideSuiteSubject, suiteConfig, suiteEnabled } from './verify.ts';

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

test('the suite entrance does not render a connected control while config is absent', () => {
  const src = readFileSync(new URL('../../components/SuiteEntrance.tsx', import.meta.url), 'utf8');
  assert.match(src, /if \(!enabled\) return null/);
  assert.match(src, /does not grant steward/);
  assert.doesNotMatch(src, /Connected/);
});
