import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { getResolution } from 'h3-js';
import { destination } from './geo.ts';
import { ownerPlacementBody } from './crowd.ts';
import { preparePlacement } from './placeRequest.ts';

process.env.PLACEMENT_SECRET = '0123456789abcdef0123456789abcdef';

const allowAll = () => true;
const now = 1_700_000_000_000;
const token = 'device-token-123456';

function body(over: Record<string, unknown> = {}) {
  const [lat, lon] = destination(1, 10);
  return { lat, lon, accuracy_m: 20, device_token: token, timestamp: now, ...over };
}

test('a placement near the center is prepared without an email', () => {
  const ready = preparePlacement({ body: body(), now, ip: '203.0.113.5', allow: allowAll });
  assert.equal(ready.ok, true);
  if (ready.ok) {
    assert.equal(ready.cell.band_km, 0);
    assert.equal(typeof ready.key, 'string');
    assert.equal(JSON.stringify(ready).includes('email'), false);
  }
});

test('the same device and window produces the same dedupe key', () => {
  const a = preparePlacement({ body: body(), now, ip: '203.0.113.5', allow: allowAll });
  const b = preparePlacement({ body: body(), now: now + 1000, ip: '198.51.100.8', allow: allowAll });
  assert.equal(a.ok && b.ok && a.key === b.key, true);
});

test('a check-in in Washington DC is a neighborhood, and the exact point is not returned', () => {
  const dc = preparePlacement({
    body: body({ lat: 38.9072, lon: -77.0369, timestamp: now }),
    now, ip: 'x', allow: allowAll,
  });
  assert.equal(dc.ok, true);
  if (!dc.ok) return;
  assert.equal(getResolution(dc.hex), 7);
  assert.equal(dc.phoneKey.length, 64);
  assert.notEqual(dc.phoneKey, dc.key);
  const later = preparePlacement({
    body: body({ lat: 38.91, lon: -77.04, timestamp: now + 25 * 60 * 60 * 1000 }),
    now: now + 25 * 60 * 60 * 1000, ip: 'x', allow: allowAll,
  });
  assert.equal(later.ok && later.phoneKey === dc.phoneKey, true);
  assert.equal(later.ok && later.key !== dc.key, true);
  const owner = ownerPlacementBody({
    status: 'placed', hex: dc.hex, placementId: 4, linkToken: 'abc', shared: false,
  });
  const text = JSON.stringify(owner);
  assert.equal(text.includes('38.9072'), false);
  assert.equal(text.includes(dc.phoneKey), false);
  assert.equal(text.includes('phone'), false);
});

test('map request rejects a missing body, an impossible point, a stale clock, and a vague fix', () => {
  assert.equal(preparePlacement({ body: {}, now, ip: 'x', allow: allowAll }).ok, false);
  const impossible = preparePlacement({
    body: body({ lat: 120, lon: 0, timestamp: now }),
    now, ip: 'x', allow: allowAll,
  });
  assert.equal(impossible.ok, false);
  const skew = preparePlacement({ body: body({ timestamp: now - 60 * 60 * 1000 }), now, ip: 'x', allow: allowAll });
  assert.equal(skew.ok, false);
  if (!skew.ok) assert.equal(skew.error, 'Clock skew too large');
  const vague = preparePlacement({ body: body({ accuracy_m: 5000 }), now, ip: 'x', allow: allowAll });
  assert.equal(vague.ok, false);
  if (!vague.ok) assert.equal(vague.error, 'Location not precise enough');
});

test('rate limit still blocks an otherwise valid place preparation', () => {
  const blocked = preparePlacement({ body: body(), now, ip: '203.0.113.9', allow: () => false });
  assert.deepEqual(blocked, { ok: false, error: 'Too many requests', status: 429 });
});


test('the place route requires a verified LinkedIn identity and uses one pin per person', () => {
  const route = readFileSync(new URL('../app/api/place/route.ts', import.meta.url), 'utf8');
  assert.match(route, /upsert_placement_for_subject/);
  assert.match(route, /Sign in with LinkedIn to check in/);
  assert.equal(route.includes('insert_placement_hex'), false);
  assert.match(route, /body.share === true/);
});
