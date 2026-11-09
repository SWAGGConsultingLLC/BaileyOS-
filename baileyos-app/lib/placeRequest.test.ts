import assert from 'node:assert/strict';
import { test } from 'node:test';
import { destination } from './geo.ts';
import { preparePlacement } from './placeRequest.ts';

process.env.PLACEMENT_SECRET = '0123456789abcdef0123456789abcdef';

const allowAll = () => true;
const now = 1_700_000_000_000;
const token = 'device-token-123456';

function body(over: Record<string, unknown> = {}) {
  const [lat, lon] = destination(1, 10);
  return { lat, lon, accuracy_m: 20, device_token: token, timestamp: now, ...over };
}

test('anonymous placement near the center is accepted without an email', () => {
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

test('map request rejects a missing body, a far point, a stale clock, and a vague fix', () => {
  assert.equal(preparePlacement({ body: {}, now, ip: 'x', allow: allowAll }).ok, false);
  const far = preparePlacement({
    body: body({ lat: 0, lon: 0, timestamp: now }),
    now, ip: 'x', allow: allowAll,
  });
  assert.equal(far.ok, false);
  if (!far.ok) assert.match(far.error, /Out of range/);
  const skew = preparePlacement({ body: body({ timestamp: now - 60 * 60 * 1000 }), now, ip: 'x', allow: allowAll });
  assert.equal(skew.ok, false);
  if (!skew.ok) assert.equal(skew.error, 'Clock skew too large');
  const vague = preparePlacement({ body: body({ accuracy_m: 5000 }), now, ip: 'x', allow: allowAll });
  assert.equal(vague.ok, false);
  if (!vague.ok) assert.equal(vague.error, 'Location not precise enough');
});

test('rate limit still blocks an otherwise valid anonymous place', () => {
  const blocked = preparePlacement({ body: body(), now, ip: '203.0.113.9', allow: () => false });
  assert.deepEqual(blocked, { ok: false, error: 'Too many requests', status: 429 });
});
