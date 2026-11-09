import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { accessFromEnv, verifiedAuthenticator } from '../workspace/auth';
import { decideRole, identityFromAuthUser } from './authorize';

const STEWARD_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_ID = '22222222-2222-4222-8222-222222222222';

test('the auth user copy keeps the id and confirmation time only', () => {
  const identity = identityFromAuthUser({
    id: MEMBER_ID,
    email_confirmed_at: '2026-11-09T00:00:00Z',
    email: 'person@example.test',
    role: 'authenticated',
    user_metadata: { role: 'steward' },
    app_metadata: { role: 'steward' },
  });
  assert.deepEqual(identity, { userId: MEMBER_ID, emailConfirmedAt: '2026-11-09T00:00:00Z' });
  assert.equal('email' in (identity ?? {}), false);
});

test('a confirmed user is a member unless the grant is active', () => {
  const identity = { userId: MEMBER_ID, emailConfirmedAt: '2026-11-09T00:00:00Z' };
  const member = decideRole(identity, 'absent');
  assert.equal(member.ok && member.actor.role, 'member');
  assert.equal(member.ok && member.actor.id, MEMBER_ID);
  const steward = decideRole({ userId: STEWARD_ID, emailConfirmedAt: '2026-11-09T00:00:00Z' }, 'active');
  assert.equal(steward.ok && steward.actor.role, 'steward');
});

test('confirmation and a failed lookup beat a grant row', () => {
  const unconfirmed = decideRole({ userId: STEWARD_ID, emailConfirmedAt: null }, 'active');
  assert.equal(unconfirmed.ok, false);
  if (!unconfirmed.ok) assert.equal(unconfirmed.status, 403);
  const blank = decideRole({ userId: STEWARD_ID, emailConfirmedAt: '   ' }, 'active');
  assert.equal(blank.ok, false);
  const closed = decideRole({ userId: STEWARD_ID, emailConfirmedAt: '2026-11-09T00:00:00Z' }, 'unavailable');
  assert.equal(closed.ok, false);
  if (!closed.ok) assert.match(closed.error, /closed/);
  const forged = decideRole({ userId: 'steward', emailConfirmedAt: '2026-11-09T00:00:00Z' }, 'active');
  assert.equal(forged.ok, false);
  if (!forged.ok) assert.equal(forged.status, 401);
});

test('the hosted authenticator ignores metadata and a revoked grant', async () => {
  const users = new Map<string, unknown>([
    ['member-token', { id: MEMBER_ID, email_confirmed_at: '2026-11-09T00:00:00Z', user_metadata: { role: 'steward' }, email: 'person@example.test' }],
    ['steward-token', { id: STEWARD_ID, email_confirmed_at: '2026-11-09T00:00:00Z', app_metadata: { role: 'member' } }],
    ['pending-token', { id: STEWARD_ID, email_confirmed_at: null, user_metadata: { role: 'steward' } }],
  ]);
  const grants = new Map<string, 'active' | 'absent' | 'unavailable'>([
    [MEMBER_ID, 'absent'],
    [STEWARD_ID, 'active'],
  ]);
  const auth = verifiedAuthenticator(
    async token => {
      const user = users.get(token);
      const identity = identityFromAuthUser(user);
      if (!identity) return { ok: false, status: 401, error: 'Sign-in required.' };
      return { ok: true, identity };
    },
    async userId => grants.get(userId) ?? 'absent',
  );

  assert.equal((await auth(null)).ok, false);
  const member = await auth('member-token');
  assert.equal(member.ok && member.actor.role, 'member');
  const steward = await auth('steward-token');
  assert.equal(steward.ok && steward.actor.role, 'steward');
  const pending = await auth('pending-token');
  assert.equal(pending.ok, false);
  grants.set(STEWARD_ID, 'absent');
  const revoked = await auth('steward-token');
  assert.equal(revoked.ok && revoked.actor.role, 'member');
  grants.set(STEWARD_ID, 'unavailable');
  const closed = await auth('steward-token');
  assert.equal(closed.ok, false);
});

test('production does not turn the fixture flag into a hosted or fixture login', () => {
  assert.equal(accessFromEnv({ nodeEnv: 'production', sessionAuth: 'fixture' }), 'closed');
  assert.equal(accessFromEnv({ nodeEnv: 'production', sessionAuth: 'fixture', supabaseUrl: 'https://example.test' }), 'closed');
  assert.equal(accessFromEnv({
    nodeEnv: 'production',
    sessionAuth: 'fixture',
    supabaseUrl: 'https://example.test',
    serviceRoleKey: 'local-test-key',
  }), 'hosted');
  assert.equal(accessFromEnv({
    nodeEnv: 'development',
    sessionAuth: 'fixture',
    supabaseUrl: 'https://example.test',
    serviceRoleKey: 'local-test-key',
  }), 'fixture');
});

test('the steward migration does not authorize from metadata and does not keep a client write', () => {
  const path = join(dirname(fileURLToPath(import.meta.url)), '../../supabase/migrations/20261109010133_steward_grants.sql');
  const code = readFileSync(path, 'utf8').replace(/--.*$/gm, '');
  assert.doesNotMatch(code, /security definer/i);
  assert.doesNotMatch(code, /user_meta/i);
  assert.doesNotMatch(code, /email/i);
  assert.match(code, /enable row level security/i);
  assert.match(code, /force row level security/i);
  assert.match(code, /revoke all/i);
  assert.match(code, /grant select on table public\.steward_grants to service_role/i);
});
