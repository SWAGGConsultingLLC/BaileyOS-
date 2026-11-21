import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { compassRecord, decideCockpitAct } from './cockpit';
import { acceptRingCenter, DEFAULT_CENTER, dissentBearings, feedMarks, LIGHTS_WIN, placeRelative, placeSeats, pointOnRing, STEWARD_BEARING } from './compass';

const slots = [
  { id: 'A', name: 'Grok', status: 'not configured' },
  { id: 'B', name: 'Gemini', status: 'ready' },
  { id: 'C', name: 'GitHub Models', status: 'ready' },
  { id: 'D', name: 'Kimi', status: 'disabled' },
  { id: 'E', name: 'Claude', status: 'disabled' },
];

test('seat 01 is east, seat 02 is west, and south stays the steward', () => {
  const placed = placeSeats(slots);
  assert.equal(placed.find((seat) => seat.id === 'A')?.bearing, 90);
  assert.equal(placed.find((seat) => seat.id === 'A')?.seat, '01');
  assert.equal(placed.find((seat) => seat.id === 'B')?.bearing, 270);
  assert.equal(placed.find((seat) => seat.id === 'B')?.seat, '02');
  assert.equal(placed.some((seat) => seat.bearing === STEWARD_BEARING), false);
  assert.equal(placed.find((seat) => seat.id === 'D')?.status, 'disabled');
  assert.equal(LIGHTS_WIN.includes('lights win'), true);
});

test('a dissenting seat lights only its own bearing', () => {
  const placed = placeSeats(slots);
  assert.deepEqual(dissentBearings(placed, []), []);
  assert.deepEqual(dissentBearings(placed, ['gemini']), [270]);
  assert.deepEqual(dissentBearings(placed, ['nobody']), []);
});

test('sector marks come only from a real veto or a real published alert', () => {
  assert.deepEqual(feedMarks([{ id: 'nws_alerts', status: 'warn', record_count: 0 }], []), []);
  const veto = feedMarks([], [{ feed_id: 'usgs', rule_id: 'SOURCE_FRESHNESS', feed_status: 'degraded', veto_triggered: true }]);
  assert.equal(veto.length, 1);
  assert.equal(veto[0].id, 'usgs');
  const alert = feedMarks([{ id: 'cdot', status: 'pass', record_count: 2 }], []);
  assert.equal(alert[0].id, 'cdot');
  assert.equal(feedMarks([{ id: 'crime', status: 'pass', record_count: 4 }], []).length, 0);
});

test('a point east of the default center sits on the east bearing', () => {
  assert.equal(DEFAULT_CENTER.name, 'Grand Junction, CO');
  assert.equal(DEFAULT_CENTER.label, 'default');
  assert.equal(acceptRingCenter(39.0639, -108.5506), null);
  assert.deepEqual(acceptRingCenter(39.06, -108.55), { lat: 39.06, lon: -108.55 });
  const placed = placeRelative(DEFAULT_CENTER, { lat: 39.06, lon: -108.4 });
  assert.ok(placed);
  assert.ok(placed && placed.bearing > 80 && placed.bearing < 100);
  assert.ok(placed && placed.distanceKm > 0);
  assert.equal(placeRelative(DEFAULT_CENTER, { lat: null, lon: null }), null);
});

test('the compass point for east is to the right of center', () => {
  const east = pointOnRing(100, 100, 40, 90);
  assert.ok(east.x > 100);
  assert.equal(east.y, 100);
});

test('steward acts stay closed until a steward is signed in', () => {
  assert.equal(decideCockpitAct({ signedIn: false, steward: false, act: 'approve', hasReport: false, head: 'ab'.repeat(32) }).error, 'Steward only');
  assert.equal(decideCockpitAct({ signedIn: true, steward: false, act: 'stand_down', hasReport: false, head: null }).status, 403);
  const convene = decideCockpitAct({ signedIn: true, steward: true, act: 'convene', hasReport: false, head: null });
  assert.equal(convene.ok, false);
  if (!convene.ok) assert.match(convene.error, /No live report/);
  const approve = decideCockpitAct({ signedIn: true, steward: true, act: 'approve', hasReport: false, head: null });
  assert.equal(approve.ok, false);
  const down = decideCockpitAct({ signedIn: true, steward: true, act: 'stand_down', hasReport: false, head: null });
  assert.equal(down.ok, true);
});

test('an empty log gives the compass nothing to draw', () => {
  const empty = compassRecord(null);
  assert.deepEqual(empty, { dissent: [], vetoes: [], sources: [] });
  const genesis = compassRecord({ queen: { ruling: 'GENESIS' }, dissent: [{ reviewer: 'gemini' }] });
  assert.deepEqual(genesis.dissent, []);
  const denied = compassRecord({
    queen: { ruling: 'DISSENT' },
    dissent: [{ reviewer: 'gemini', reason: 'no' }],
    code_vetoes: [{ feed_id: 'usgs', rule_id: 'C7', feed_status: 'fail', veto_triggered: true }],
    freshness: { sources: [{ id: 'nws_alerts', status: 'warn', record_count: 0 }] },
  });
  assert.deepEqual(denied.dissent, ['gemini']);
  assert.equal(denied.vetoes.length, 1);
});

test('the cockpit page keeps the lights first and the words honest', () => {
  const page = readFileSync(new URL('../../app/landing-stone/cockpit/page.tsx', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../../supabase/migrations/20261121060000_steward_cockpit_acts.sql', import.meta.url), 'utf8');
  assert.match(page, /The lights inform\. The steward decides\./);
  assert.match(page, /Grand Junction, CO/);
  assert.match(page, /terrain not connected/);
  assert.match(page, /Question #001/);
  assert.match(page, />You</);
  assert.match(page, /href="\/data-nest"/);
  assert.match(page, /href="\/landing-stone"/);
  assert.match(page, /href="\/landing-stone\/prototype"/);
  assert.match(page, /Steward only/);
  assert.match(page, /disabled=\{!steward\}/);
  assert.equal(/\bSAFE\b/.test(page), false);
  assert.equal(page.toLowerCase().includes('proof'), false);
  assert.match(migration, /steward_cockpit_acts/);
  assert.match(migration, /approve/);
  assert.match(migration, /stand_down/);
  assert.match(migration, /append-only/);
});
