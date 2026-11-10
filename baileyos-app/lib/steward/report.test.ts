import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { stewardReportAccess } from './report.ts';

const STEWARD = '11111111-1111-4111-8111-111111111111';
const MEMBER = '22222222-2222-4222-8222-222222222222';

test('the steward report allows only an active grant for this subject', () => {
  assert.deepEqual(stewardReportAccess(null, null), { ok: false, status: 401, error: 'Sign in required.' });
  assert.deepEqual(stewardReportAccess(MEMBER, null), { ok: false, status: 403, error: 'Steward only' });
  assert.deepEqual(stewardReportAccess(MEMBER, { subjectId: STEWARD, revokedAt: null }), { ok: false, status: 403, error: 'Steward only' });
  assert.deepEqual(stewardReportAccess(STEWARD, { subjectId: STEWARD, revokedAt: '2026-11-10T00:00:00Z' }), { ok: false, status: 403, error: 'Steward only' });
  assert.deepEqual(stewardReportAccess(STEWARD, { subjectId: STEWARD, revokedAt: null }), { ok: true });
});

test('the report page does not invent questions or counts', () => {
  const page = readFileSync(new URL('../../app/steward/page.tsx', import.meta.url), 'utf8');
  const route = readFileSync(new URL('../../app/api/steward/report/route.ts', import.meta.url), 'utf8');
  assert.match(page, /No consensus questions yet/);
  assert.match(page, /Steward only/);
  assert.match(route, /stewardReportAccess/);
  assert.doesNotMatch(page, /user_metadata|email ===|provider_sub/);
  assert.doesNotMatch(route, /user_metadata|email ===/);
});
