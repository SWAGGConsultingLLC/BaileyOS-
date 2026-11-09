import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { completeSuiteLogin, isActiveSteward, suiteStatusText } from './decide.ts';

const STEWARD = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

test('only the exact active subject is steward', () => {
  assert.equal(isActiveSteward(STEWARD, { subjectId: STEWARD, revokedAt: null }), true);
  assert.equal(isActiveSteward(OTHER, { subjectId: STEWARD, revokedAt: null }), false);
  assert.equal(isActiveSteward(STEWARD, { subjectId: STEWARD, revokedAt: '2026-11-09T00:00:00Z' }), false);
  assert.equal(isActiveSteward(STEWARD, null), false);
  assert.equal(isActiveSteward('not-a-uuid', { subjectId: 'not-a-uuid', revokedAt: null }), false);
});

test('a verified sign-in stays ordinary unless the grant row is active', async () => {
  const seen: string[] = [];
  const ordinary = await completeSuiteLogin(OTHER, {
    remember: async subject => { seen.push(subject); },
    readGrant: async () => null,
  });
  assert.deepEqual(ordinary, { subject: OTHER, steward: false, recorded: true });
  const steward = await completeSuiteLogin(STEWARD, {
    remember: async () => undefined,
    readGrant: async () => ({ subjectId: STEWARD, revokedAt: null }),
  });
  assert.equal(steward.steward, true);
  const revoked = await completeSuiteLogin(STEWARD, {
    remember: async () => undefined,
    readGrant: async () => ({ subjectId: STEWARD, revokedAt: '2026-11-09T00:00:00Z' }),
  });
  assert.equal(revoked.steward, false);
  const closed = await completeSuiteLogin(STEWARD, {
    remember: async () => { throw new Error('table missing'); },
    readGrant: async () => ({ subjectId: STEWARD, revokedAt: null }),
  });
  assert.equal(closed.steward, false);
  assert.equal(closed.recorded, false);
  assert.equal(suiteStatusText(closed), '360° Brewing recognized this sign-in, but the map did not record it.');
  assert.equal(suiteStatusText({ recorded: true, steward: false }), 'Signed in with 360° Brewing. Not the steward.');
  assert.equal(suiteStatusText({ recorded: true, steward: true }), 'Signed in with 360° Brewing. Steward.');
  assert.deepEqual(seen, [OTHER]);
});

test('the return page shows steward only from the server flag', () => {
  const src = readFileSync(new URL('../../app/suite/page.tsx', import.meta.url), 'utf8');
  assert.match(src, /body\.recorded === true/);
  assert.match(src, /SuiteBadge/);
  assert.doesNotMatch(src, /user_metadata|email ===/);
});
