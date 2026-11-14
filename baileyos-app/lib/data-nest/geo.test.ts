import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { bearingDeg, coarsen, etaMinutes, haversineKm, isAhead, shouldAcceptFix, TRAVEL_MPS } from './geo.ts';
import { chatEnabled, nextAutoMode } from './mode.ts';

test('haversine matches the Python validator', () => {
  const py = spawnSync('python3', ['-c', 'import sys; sys.path.insert(0,"api"); from _validate_corridor import haversine_km; print(haversine_km(-104.99, 39.74, -108.55, 39.06))'], { encoding: 'utf8' });
  assert.equal(py.status, 0, py.stderr);
  const ts = haversineKm(-104.99, 39.74, -108.55, 39.06);
  assert.ok(Math.abs(ts - Number(py.stdout)) < 1e-6, ts);
  assert.ok(ts > 300 && ts < 380);
});

test('coarsen keeps about a kilometer and drops a precise fix', () => {
  const coarse = coarsen(39.06391, -108.55064);
  assert.deepEqual(coarse, { lat: 39.06, lon: -108.55 });
});

test('ahead cone and ETA stay quiet below 5 mph', () => {
  assert.equal(isAhead(90, 100), true);
  assert.equal(isAhead(90, 200), false);
  assert.equal(isAhead(null, 90), false);
  assert.equal(etaMinutes(10, TRAVEL_MPS - 0.1), null);
  assert.ok((etaMinutes(10, 20) || 0) > 0);
  assert.ok(bearingDeg(-108.55, 39.06, -107.32, 39.55) > 0);
});

test('a fix is throttled unless time or distance moves', () => {
  const prev = { t: 0, lat: 39.06, lon: -108.55 };
  assert.equal(shouldAcceptFix(prev, { t: 1000, lat: 39.06, lon: -108.55 }), false);
  assert.equal(shouldAcceptFix(prev, { t: 9000, lat: 39.06, lon: -108.55 }), true);
});

test('traveling and chat follow speed, with a passenger override', () => {
  assert.equal(nextAutoMode(TRAVEL_MPS + 0.1, 'stationary'), 'traveling');
  assert.equal(nextAutoMode(0.2, 'traveling'), 'stationary');
  assert.equal(nextAutoMode(1.5, 'stationary'), 'stationary');
  assert.equal(chatEnabled(TRAVEL_MPS + 1, false), false);
  assert.equal(chatEnabled(TRAVEL_MPS + 1, true), true);
  assert.equal(chatEnabled(0, false), true);
});
