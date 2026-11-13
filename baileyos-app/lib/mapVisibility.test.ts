import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { neighborhoodHex } from './neighborhood.ts';
import { CHECKIN_VISIBLE_MS, mapPlacements, type StoredCheckIn } from './mapVisibility.ts';

const NOW = Date.parse('2026-11-13T12:00:00-07:00');
const HEX_A = neighborhoodHex(39.0639, -108.5506);
const HEX_B = neighborhoodHex(39.0433, -108.0617);
const ADA = '11111111-1111-4111-8111-111111111111';
const GRACE = '22222222-2222-4222-8222-222222222222';
const LINUS = '33333333-3333-4333-8333-333333333333';

function row(over: Partial<StoredCheckIn> & Pick<StoredCheckIn, 'subjectId' | 'hex'>): StoredCheckIn {
  return { at: NOW - 60_000, card: null, ...over };
}

const shared = {
  name: 'Ada Lovelace',
  photo: 'https://media.licdn.com/photo.jpg',
  profileUrl: null,
};

test('a logged-out viewer sees no pins', () => {
  const body = mapPlacements({
    people: 2,
    zoomIn: false,
    viewerSubjectId: null,
    rows: [row({ subjectId: ADA, hex: HEX_A, card: shared }), row({ subjectId: GRACE, hex: HEX_A })],
    onScreen: [HEX_A, HEX_B],
    now: NOW,
  });
  assert.equal(body.people, 2);
  assert.equal(body.neighborhoods.length, 0);
  assert.equal(JSON.stringify(body).includes(ADA), false);
});

test('two people in neighborhood A see each other, and someone in B does not', () => {
  const rows = [
    row({ subjectId: ADA, hex: HEX_A, card: shared }),
    row({ subjectId: GRACE, hex: HEX_A }),
    row({ subjectId: LINUS, hex: HEX_B, card: { name: 'Grace Hopper', photo: null, profileUrl: null } }),
  ];
  const seenByAda = mapPlacements({
    people: 2, zoomIn: false, viewerSubjectId: ADA, rows, onScreen: [HEX_A, HEX_B], now: NOW,
  });
  assert.equal(seenByAda.neighborhoods.length, 1);
  assert.equal(seenByAda.neighborhoods[0].hex, HEX_A);
  assert.equal(seenByAda.neighborhoods[0].pins.length, 2);
  assert.equal(seenByAda.neighborhoods[0].pins[0].name, 'Ada Lovelace');
  assert.equal(seenByAda.neighborhoods[0].pins[0].photo, 'https://media.licdn.com/photo.jpg');
  assert.equal(seenByAda.neighborhoods[0].pins[1].name, null);
  assert.equal(seenByAda.neighborhoods[0].pins[1].photo, null);
  const text = JSON.stringify(seenByAda);
  assert.equal(text.includes(GRACE), false);
  assert.equal(text.includes(HEX_B), false);
  assert.equal(text.includes('Grace Hopper'), false);
  assert.equal(text.includes('lat'), false);
  assert.equal(text.includes('phone'), false);

  const seenByLinus = mapPlacements({
    people: 2, zoomIn: false, viewerSubjectId: LINUS, rows, onScreen: [HEX_A, HEX_B], now: NOW,
  });
  assert.equal(seenByLinus.neighborhoods.length, 1);
  assert.equal(seenByLinus.neighborhoods[0].hex, HEX_B);
  assert.equal(seenByLinus.neighborhoods[0].pins.length, 1);
  assert.equal(seenByLinus.neighborhoods[0].pins[0].name, 'Grace Hopper');
  assert.equal(JSON.stringify(seenByLinus).includes('Ada Lovelace'), false);
});

test('a person keeps one pin, the most recent one', () => {
  const rows = [
    row({
      subjectId: GRACE,
      hex: HEX_A,
      at: NOW - 2 * 24 * 60 * 60 * 1000,
      card: { name: 'Grace Hopper', photo: null, profileUrl: null },
    }),
    row({ subjectId: GRACE, hex: HEX_B, at: NOW - 60_000 }),
    row({ subjectId: ADA, hex: HEX_A }),
  ];
  const fromA = mapPlacements({
    people: 2, zoomIn: false, viewerSubjectId: ADA, rows, onScreen: [HEX_A, HEX_B], now: NOW,
  });
  assert.equal(fromA.neighborhoods[0].pins.length, 1);
  assert.equal(fromA.neighborhoods[0].pins[0].name, null);
  const fromB = mapPlacements({
    people: 2, zoomIn: false, viewerSubjectId: GRACE, rows, onScreen: [HEX_A, HEX_B], now: NOW,
  });
  assert.equal(fromB.neighborhoods.length, 1);
  assert.equal(fromB.neighborhoods[0].hex, HEX_B);
  assert.equal(fromB.neighborhoods[0].pins.length, 1);
  assert.equal(fromB.neighborhoods[0].pins[0].name, null);
});

test('two check-ins at the same time keep the later row', () => {
  const rows = [
    row({ subjectId: GRACE, hex: HEX_A, at: NOW - 60_000, id: 4, card: shared }),
    row({ subjectId: GRACE, hex: HEX_B, at: NOW - 60_000, id: 9 }),
    row({ subjectId: ADA, hex: HEX_B, at: NOW - 60_000 }),
  ];
  const body = mapPlacements({
    people: 2, zoomIn: false, viewerSubjectId: ADA, rows, onScreen: [HEX_A, HEX_B], now: NOW,
  });
  assert.equal(body.neighborhoods[0].hex, HEX_B);
  assert.equal(body.neighborhoods[0].pins.length, 2);
  assert.equal(body.neighborhoods[0].pins.every(pin => pin.name == null), true);
});

test('a shared name stays on the newest pin, and an old check-in drops off the map', () => {
  const fresh = row({ subjectId: ADA, hex: HEX_A, card: shared });
  const stale = row({ subjectId: GRACE, hex: HEX_A, at: NOW - CHECKIN_VISIBLE_MS - 1000, card: shared });
  const body = mapPlacements({
    people: 1, zoomIn: false, viewerSubjectId: ADA, rows: [fresh, stale], onScreen: [HEX_A], now: NOW,
  });
  assert.equal(body.neighborhoods[0].pins.length, 1);
  assert.equal(body.neighborhoods[0].pins[0].name, 'Ada Lovelace');
  const expiredViewer = mapPlacements({
    people: 1,
    zoomIn: false,
    viewerSubjectId: GRACE,
    rows: [stale, fresh],
    onScreen: [HEX_A],
    now: NOW,
  });
  assert.equal(expiredViewer.neighborhoods.length, 0);
});

test('the placements route checks the viewer and does not list every neighborhood', () => {
  const route = readFileSync(new URL('../app/api/placements/route.ts', import.meta.url), 'utf8');
  assert.match(route, /mapPlacements/);
  assert.match(route, /verified_suite_subjects/);
  assert.match(route, /linkedin_oidc/);
  assert.match(route, /authorization/i);
  assert.equal(route.includes('public_map_checkins'), false);
  assert.equal(route.includes('phone_key'), false);
  assert.equal(route.includes('searchParams.get(\'viewer\''), false);
  const home = readFileSync(new URL('../components/MapHome.tsx', import.meta.url), 'utf8');
  assert.match(home, /Authorization: `Bearer \$\{token\}`/);
  assert.match(home, /suiteSignedIn \? mine : null/);
  const sql = readFileSync(new URL('../supabase/migrations/20261113163000_neighborhood_pin_visibility.sql', import.meta.url), 'utf8');
  assert.match(sql, /map_pins_for_viewer/);
  assert.match(sql, /p_viewer is null/);
  assert.match(sql, /interval '28 days'/);
  assert.match(sql, /distinct on \(subject_id\)/);
  assert.match(sql, /revoke all on function public\.map_pins_for_viewer\(text\[\], uuid\) from public, anon, authenticated/);
  assert.match(sql, /placements_one_subject_idx/);
  assert.equal(sql.includes('phone_key'), false);
  assert.equal(/count\s*\(\s*distinct/i.test(sql), false);
  const retention = readFileSync(new URL('../app/api/retention/route.ts', import.meta.url), 'utf8');
  assert.match(retention, /RETENTION_DAYS \|\| 28/);
});
