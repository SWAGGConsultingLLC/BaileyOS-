import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { getResolution } from 'h3-js';
import { CROWD_MIN, CROWD_WINDOW_MS, publicNeighborhoods, type CrowdRow } from './crowd.ts';
import { hexesCovering, jitterInHex, legacyNeighborhoodHex, neighborhoodHex } from './neighborhood.ts';

const NOW = Date.parse('2026-11-10T04:00:00Z');
const HEX = neighborhoodHex(38.9072, -77.0369);
const OTHER = neighborhoodHex(39.0639, -108.5506);

function row(phoneKey: string | null, over: Partial<CrowdRow> = {}): CrowdRow {
  return { hex: HEX, phoneKey, at: NOW - 60_000, card: null, ...over };
}

test('three different phones show a neighborhood and two do not', () => {
  assert.equal(CROWD_MIN, 3);
  const hidden = publicNeighborhoods([row('phone-a'), row('phone-b')], new Set([HEX]), NOW);
  assert.equal(hidden.phones, 0);
  assert.equal(hidden.neighborhoods.length, 0);
  const shown = publicNeighborhoods([row('phone-a'), row('phone-b'), row('phone-c')], new Set([HEX]), NOW);
  assert.equal(shown.phones, 3);
  assert.equal(shown.neighborhoods.length, 1);
  assert.equal(shown.neighborhoods[0].hex, HEX);
});

test('the same phone on several days counts once, and a kept row does not count', () => {
  const rows = [
    row('phone-a', { at: NOW - 2 * 24 * 60 * 60 * 1000 }),
    row('phone-a', { at: NOW - 60_000 }),
    row('phone-b'),
    row(null),
    row(null),
    row(null),
  ];
  const result = publicNeighborhoods(rows, new Set([HEX]), NOW);
  assert.equal(result.phones, 0);
  const enough = publicNeighborhoods([...rows, row('phone-c')], new Set([HEX]), NOW);
  assert.equal(enough.phones, 3);
  assert.equal(enough.neighborhoods[0].phones, 3);
});

test('a check-in older than seven days and a neighborhood off screen stay hidden', () => {
  const old = row('phone-a', { at: NOW - CROWD_WINDOW_MS - 1000 });
  const result = publicNeighborhoods(
    [old, row('phone-b'), row('phone-c'), row('phone-d', { hex: OTHER })],
    new Set([HEX]),
    NOW,
  );
  assert.equal(result.phones, 0);
});

test('a name is public only inside a neighborhood that meets the crowd, and markers stay off the response', () => {
  const card = { name: 'Ada Lovelace', photo: 'https://media.licdn.com/photo.jpg', profileUrl: null };
  const marker = 'server-only-phone-marker';
  const hidden = publicNeighborhoods([
    row(marker, { card }),
    row('phone-b', { card }),
  ], new Set([HEX]), NOW);
  assert.equal(JSON.stringify(hidden).includes('Ada'), false);
  const shown = publicNeighborhoods([
    row(marker, { card }),
    row('phone-b'),
    row('phone-c'),
  ], new Set([HEX]), NOW);
  assert.equal(shown.neighborhoods[0].cards.length, 1);
  assert.equal(shown.neighborhoods[0].cards[0].name, 'Ada Lovelace');
  const text = JSON.stringify(shown);
  assert.equal(text.includes(marker), false);
  assert.equal(text.includes('phoneKey'), false);
  assert.equal(text.includes('lat'), false);
  assert.equal(text.includes('lon'), false);
  assert.equal(text.includes('band_km'), false);
  assert.equal(text.includes('coordinates'), false);
  const route = readFileSync(new URL('../app/api/placements/route.ts', import.meta.url), 'utf8');
  assert.match(route, /publicNeighborhoods/);
  assert.match(route, /no-store/);
  assert.equal(route.includes('band_km'), false);
});

test('neighborhoods are resolution 7 and a jittered dot stays inside the hex', () => {
  assert.equal(getResolution(HEX), 7);
  assert.equal(getResolution(legacyNeighborhoodHex(0, 0)), 7);
  assert.notEqual(legacyNeighborhoodHex(0, 0), legacyNeighborhoodHex(0, 9));
  for (let i = 0; i < 30; i += 1) {
    const [lat, lon] = jitterInHex(HEX);
    assert.equal(neighborhoodHex(lat, lon), HEX);
  }
  const [lat, lon] = [38.9072, -77.0369];
  const covering = hexesCovering({ west: lon - 0.2, south: lat - 0.2, east: lon + 0.2, north: lat + 0.2 });
  assert.equal(covering.includes(HEX), true);
});
