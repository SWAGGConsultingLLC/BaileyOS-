import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DEFAULT_CENTER } from '@/lib/landing-stone/compass';
import type { LiveItem } from './liveFeeds';
import {
  CANON_HREF,
  DEFAULT_CELL_ID,
  PULL_RADIUS_KM,
  canonicalJson,
  chooseSeatBrief,
  compassMarks,
  labelFor,
  recordSha,
  saltedInputSha,
  seatReadingBrief,
  sha256Hex,
  snapshotsFromLive,
  toStoredReading,
} from './nestPull';

const quake: LiveItem = {
  id: 'us1000',
  layer: 'quakes',
  title: 'M 1.2 10km NW of Grand Junction',
  summary: 'should not be stored',
  lon: -108.55,
  lat: 39.16,
  agency: 'USGS',
  issuedAt: '2026-11-21T12:00:00Z',
  expiresAt: null,
  sourceUrl: 'https://earthquake.usgs.gov/fdsnws/event/1/',
  sourceName: 'USGS Earthquake Hazards',
  kind: 'quake',
};

test('the default cell is Grand Junction at two decimal degrees', () => {
  assert.equal(DEFAULT_CELL_ID, '39.06,-108.55');
  assert.equal(DEFAULT_CENTER.lat, 39.06);
  assert.equal(DEFAULT_CENTER.lon, -108.55);
  assert.equal(CANON_HREF.endsWith('/canon/'), true);
});

test('a failed feed stores no invented items and a live feed keeps the provider rows', () => {
  const drafts = snapshotsFromLive('39.06,-108.55', {
    fetchedAt: '2026-11-21T12:00:00Z',
    items: [quake],
    freshness: {
      usgs: { available: true, record_count: 1, fetched_at: '2026-11-21T12:00:00Z', http_status: 200, schema_status: 'ok', source_timestamp: '2026-11-21T11:00:00Z' },
      nws_alerts: { available: false, record_count: 0, error: 'HTTP 503', http_status: 503, schema_status: 'absent', fetched_at: '2026-11-21T12:00:00Z' },
      udot: { available: false, record_count: 0, error: 'needs setup: UDOT_511_API_KEY', schema_status: 'absent', fetched_at: null },
    },
  });
  const usgs = drafts.find((row) => row.source === 'usgs');
  const nws = drafts.find((row) => row.source === 'nws_alerts');
  const udot = drafts.find((row) => row.source === 'udot');
  assert.equal(usgs?.payload.label, 'live provider response');
  assert.equal(usgs?.payload.items.length, 1);
  assert.equal(usgs?.payload.items[0].title, quake.title);
  assert.equal(JSON.stringify(usgs?.payload).includes('should not be stored'), false);
  assert.equal(nws?.payload.label, 'provider did not answer');
  assert.deepEqual(nws?.payload.items, []);
  assert.equal(nws?.record_count, 0);
  assert.equal(udot?.payload.label, 'needs setup');
  assert.deepEqual(udot?.payload.items, []);
  assert.equal(udot?.fetched_at, '2026-11-21T12:00:00Z');
  assert.equal(labelFor(undefined), 'provider did not answer');
  assert.match(usgs?.payload_sha256 || '', /^[0-9a-f]{64}$/);
});

test('the salted input hash covers the cell and radius only', () => {
  const salt = 'ab'.repeat(16);
  const userId = '11111111-1111-1111-1111-111111111111';
  const hash = saltedInputSha(salt, DEFAULT_CELL_ID, PULL_RADIUS_KM);
  const preimage = `${salt}:${canonicalJson({ cell_id: DEFAULT_CELL_ID, radius_km: PULL_RADIUS_KM })}`;
  assert.equal(hash, sha256Hex(preimage));
  assert.equal(preimage.includes(userId), false);
  assert.equal(preimage.includes('@'), false);
  const rows = snapshotsFromLive(DEFAULT_CELL_ID, { fetchedAt: '2026-11-21T12:00:00Z', items: [], freshness: {} });
  const record = recordSha(DEFAULT_CELL_ID, rows);
  assert.equal(record, recordSha(DEFAULT_CELL_ID, [...rows].reverse()));
  assert.equal(record.includes(userId), false);
});

test('seats receive stored readings in place of a chopped live report', () => {
  const report = 'LIVE-REPORT-'.repeat(400);
  assert.equal(report.length > 3500, true);
  const chopped = chooseSeatBrief(report, null);
  assert.equal(chopped.length, 3500);
  assert.equal(chopped.startsWith('LIVE-REPORT'), true);
  const empty = chooseSeatBrief(report, []);
  assert.equal(empty.includes('LIVE-REPORT'), false);
  assert.match(empty, /Stored readings: none/);
  const unread = chooseSeatBrief(report, 'unread');
  assert.equal(unread.includes('LIVE-REPORT'), false);
  assert.match(unread, /could not be read/);
  const reading = toStoredReading({
    source: 'usgs',
    source_url: 'https://earthquake.usgs.gov/fdsnws/event/1/',
    fetched_at: '2026-11-21T12:00:00Z',
    available: true,
    record_count: 1,
    payload_sha256: 'a'.repeat(64),
    payload: { label: 'live provider response', items: [{ id: 'us1000', title: quake.title, lat: 39.16, lon: -108.55, agency: 'USGS', issuedAt: null, sourceName: 'USGS', kind: 'quake', summary: 'hidden name' }] },
  });
  assert.ok(reading);
  assert.equal(JSON.stringify(reading).includes('hidden name'), false);
  const brief = seatReadingBrief([reading]);
  assert.equal(brief.includes('LIVE-REPORT'), false);
  assert.equal(brief.includes(userless(reading)), true);
  assert.equal(brief.includes('live provider response'), true);
});

function userless(reading: { source: string }): string {
  return reading.source;
}

test('the compass places a stored point from the default cell', () => {
  const reading = toStoredReading({
    source: 'usgs',
    fetched_at: '2026-11-21T12:00:00Z',
    available: true,
    record_count: 1,
    payload_sha256: 'b'.repeat(64),
    payload: { label: 'live provider response', items: [{ id: 'us1000', title: quake.title, lat: 39.16, lon: -108.55, agency: 'USGS', issuedAt: null, sourceName: 'USGS', kind: 'quake' }] },
  });
  assert.ok(reading);
  const marks = compassMarks({ lat: DEFAULT_CENTER.lat, lon: DEFAULT_CENTER.lon }, [reading]);
  assert.equal(marks.length, 1);
  assert.equal(marks[0].bearing, 0);
  assert.equal(marks[0].label, 'live provider response');
  const missed = toStoredReading({
    source: 'nws_alerts',
    fetched_at: '2026-11-21T12:00:00Z',
    available: false,
    record_count: 0,
    error: 'HTTP 503',
    payload_sha256: 'c'.repeat(64),
    payload: { label: 'provider did not answer', items: [{ id: 'nope', title: 'invented', lat: 39.2, lon: -108.5 }] },
  });
  assert.deepEqual(missed?.items, []);
  assert.equal(compassMarks(DEFAULT_CENTER, [reading, missed!]).some((mark) => mark.title === 'invented'), false);
});

test('new nest files do not use the banned words', () => {
  const files = [
    'lib/data-nest/nestPull.ts',
    'lib/data-nest/nestView.ts',
    'lib/data-nest/nestStore.ts',
    'app/api/data-nest/pull/route.ts',
    'app/api/data-nest/nest/route.ts',
    'app/api/data-nest/nest/forget/route.ts',
    'components/data-nest/MyNest.tsx',
    'app/data-nest/mine/page.tsx',
    'lib/data-nest/liveVoters.ts',
  ];
  const banned = /\bproof\b|tamper-proof|\bSAFE\b/i;
  for (const file of files) {
    const text = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    assert.equal(banned.test(text), false, file);
  }
});
