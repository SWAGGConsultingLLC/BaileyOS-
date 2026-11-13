import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseAgeGateLog } from './ageGateLog.ts';

test('age-gate logs accept click and dwell in milliseconds, and reject identity fields', () => {
  assert.deepEqual(parseAgeGateLog({ event: 'gate_shown' }), { event: 'gate_shown' });
  assert.deepEqual(parseAgeGateLog({ event: 'click' }), { event: 'click' });
  assert.deepEqual(parseAgeGateLog({ event: 'dwell', dwell_ms: 1500 }), { event: 'dwell', dwell_ms: 1500 });
  assert.equal('error' in parseAgeGateLog({ event: 'dwell' }), true);
  assert.equal('error' in parseAgeGateLog({ event: 'click', dwell_ms: 10 }), true);
  const route = readFileSync(new URL('../app/api/age-gate/route.ts', import.meta.url), 'utf8');
  assert.match(route, /age_gate_events/);
  assert.match(route, /dwell_ms/);
  assert.equal(/from\('age_verifications'\)/.test(route), false);
});
