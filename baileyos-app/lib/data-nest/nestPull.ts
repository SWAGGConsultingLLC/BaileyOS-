import { createHash, randomBytes } from 'node:crypto';
import { DEFAULT_CENTER } from '@/lib/landing-stone/compass';
import type { LiveItem } from './liveFeeds';
import type { ReadingItem, ReadingLabel, StoredReading } from './nestView';

export type { ReadingItem, ReadingLabel, StoredReading } from './nestView';
export { CANON_HREF, compassMarks } from './nestView';

/** Grand Junction, already coarsened. Matches area_cells.id and DEFAULT_CENTER. */
export const DEFAULT_CELL_ID = `${DEFAULT_CENTER.lat.toFixed(2)},${DEFAULT_CENTER.lon.toFixed(2)}`;
export const PULL_RADIUS_KM = 80;

export type SnapshotDraft = {
  cell_id: string;
  source: string;
  source_url: string;
  fetched_at: string;
  source_timestamp: string | null;
  http_status: number | null;
  available: boolean;
  record_count: number;
  payload_sha256: string;
  payload: { label: ReadingLabel; schema_status: string; items: ReadingItem[] };
  error: string | null;
};

const SOURCES = ['usgs', 'nws_alerts', 'amber', 'silver', 'nws_observation', 'cdot', 'udot', 'crime'] as const;

const LAYER: Record<string, LiveItem['layer'] | null> = {
  usgs: 'quakes',
  nws_alerts: 'nws',
  amber: 'amber',
  silver: 'silver',
  nws_observation: 'observation',
  cdot: 'roads',
  udot: null,
  crime: null,
};

type Fresh = {
  available?: boolean;
  fetched_at?: string | null;
  source_timestamp?: string | null;
  record_count?: number;
  error?: string | null;
  http_status?: number | null;
  schema_status?: string;
};

export type LivePull = {
  items: LiveItem[];
  freshness: Record<string, Fresh>;
  fetchedAt: string;
};

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const next = (value as Record<string, unknown>)[key];
      if (next !== undefined) out[key] = sortValue(next);
    }
    return out;
  }
  return value;
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function newInputSalt(): string {
  return randomBytes(16).toString('hex');
}

/** Hash of the pull request. The preimage is the salt plus the public cell and radius. */
export function saltedInputSha(salt: string, cellId: string, radiusKm: number): string {
  return sha256Hex(`${salt}:${canonicalJson({ cell_id: cellId, radius_km: radiusKm })}`);
}

export function recordSha(cellId: string, rows: Pick<SnapshotDraft, 'source' | 'payload_sha256' | 'record_count' | 'available' | 'fetched_at'>[]): string {
  const snapshots = rows.map((row) => ({
    available: row.available,
    fetched_at: row.fetched_at,
    payload_sha256: row.payload_sha256,
    record_count: row.record_count,
    source: row.source,
  })).sort((a, b) => a.source.localeCompare(b.source));
  return sha256Hex(canonicalJson({ cell_id: cellId, snapshots }));
}

export function labelFor(fresh: Fresh | undefined): ReadingLabel {
  const error = fresh?.error || '';
  if (error.startsWith('needs setup')) return 'needs setup';
  if (!fresh?.available) return 'provider did not answer';
  return 'live provider response';
}

export function sourceUrl(source: string, cellId: string): string {
  const [lat, lon] = cellId.split(',');
  if (source === 'usgs') {
    return `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=${lat}&longitude=${lon}&maxradiuskm=${PULL_RADIUS_KM}`;
  }
  if (source === 'nws_alerts' || source === 'amber' || source === 'silver') return 'https://api.weather.gov/alerts/active?area=CO';
  if (source === 'nws_observation') return `https://api.weather.gov/points/${lat},${lon}`;
  if (source === 'cdot') return 'https://maps.codot.gov/server/rest/services/Hosted/CoTrip_Alerts_Points_(Live)_Public_View/FeatureServer/0';
  if (source === 'udot') return 'https://www.udot.utah.gov/connect/business/traffic-data/';
  if (source === 'crime') return 'https://crime-data-explorer.fr.cloud.gov/';
  return 'https://baileyos-app.vercel.app/data-nest';
}

function publicItem(item: LiveItem): ReadingItem {
  return {
    id: item.id,
    title: item.title,
    lat: item.lat,
    lon: item.lon,
    agency: item.agency,
    issuedAt: item.issuedAt,
    sourceName: item.sourceName,
    kind: item.kind,
  };
}

export function snapshotsFromLive(cellId: string, live: LivePull): SnapshotDraft[] {
  return SOURCES.map((source) => {
    const fresh = live.freshness[source];
    const label = labelFor(fresh);
    const layer = LAYER[source];
    const items = label === 'live provider response' && layer
      ? live.items.filter((item) => item.layer === layer).map(publicItem)
      : [];
    const payload = {
      label,
      schema_status: fresh?.schema_status || 'absent',
      items,
    };
    return {
      cell_id: cellId,
      source,
      source_url: sourceUrl(source, cellId),
      fetched_at: fresh?.fetched_at || live.fetchedAt,
      source_timestamp: fresh?.source_timestamp ?? null,
      http_status: fresh?.http_status ?? null,
      available: Boolean(fresh?.available),
      record_count: typeof fresh?.record_count === 'number' ? fresh.record_count : 0,
      payload_sha256: sha256Hex(canonicalJson(payload)),
      payload,
      error: fresh?.error ?? null,
    };
  });
}

const LABELS = new Set<ReadingLabel>(['live provider response', 'provider did not answer', 'needs setup']);

export function toStoredReading(row: {
  source?: unknown;
  source_url?: unknown;
  fetched_at?: unknown;
  source_timestamp?: unknown;
  http_status?: unknown;
  available?: unknown;
  record_count?: unknown;
  payload_sha256?: unknown;
  error?: unknown;
  payload?: unknown;
}): StoredReading | null {
  if (typeof row.source !== 'string' || typeof row.payload_sha256 !== 'string') return null;
  const payload = row.payload && typeof row.payload === 'object' ? row.payload as { label?: unknown; items?: unknown } : {};
  const label = typeof payload.label === 'string' && LABELS.has(payload.label as ReadingLabel)
    ? payload.label as ReadingLabel
    : labelFor({ available: row.available === true, error: typeof row.error === 'string' ? row.error : null });
  const items = label === 'live provider response' && Array.isArray(payload.items)
    ? payload.items.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const rowItem = item as Record<string, unknown>;
      const title = typeof rowItem.title === 'string' ? rowItem.title : '';
      if (!title) return [];
      return [{
        id: typeof rowItem.id === 'string' ? rowItem.id : title,
        title,
        lat: typeof rowItem.lat === 'number' ? rowItem.lat : null,
        lon: typeof rowItem.lon === 'number' ? rowItem.lon : null,
        agency: typeof rowItem.agency === 'string' ? rowItem.agency : '',
        issuedAt: typeof rowItem.issuedAt === 'string' ? rowItem.issuedAt : null,
        sourceName: typeof rowItem.sourceName === 'string' ? rowItem.sourceName : '',
        kind: typeof rowItem.kind === 'string' ? rowItem.kind : '',
      }];
    })
    : [];
  return {
    source: row.source,
    sourceUrl: typeof row.source_url === 'string' ? row.source_url : sourceUrl(row.source, DEFAULT_CELL_ID),
    fetchedAt: typeof row.fetched_at === 'string' ? row.fetched_at : '',
    sourceTimestamp: typeof row.source_timestamp === 'string' ? row.source_timestamp : null,
    httpStatus: typeof row.http_status === 'number' ? row.http_status : null,
    available: row.available === true,
    recordCount: typeof row.record_count === 'number' ? row.record_count : 0,
    payloadSha256: row.payload_sha256,
    error: typeof row.error === 'string' ? row.error : null,
    label,
    items,
  };
}

function readingMeta(reading: StoredReading, withItems: boolean) {
  return {
    available: reading.available,
    error: reading.error,
    fetched_at: reading.fetchedAt,
    http_status: reading.httpStatus,
    items: withItems ? reading.items.map((item) => ({
      id: item.id,
      issued_at: item.issuedAt,
      kind: item.kind,
      lat: item.lat,
      lon: item.lon,
      source_name: item.sourceName,
      title: item.title,
    })) : [],
    label: reading.label,
    payload_sha256: reading.payloadSha256,
    record_count: reading.recordCount,
    source: reading.source,
  };
}

/** Text the seats read. Stored readings only. A long live report is not copied in. */
export function seatReadingBrief(readings: StoredReading[] | 'unread'): string {
  if (readings === 'unread') return 'Stored readings could not be read. No live report was substituted.';
  if (!readings.length) return 'Stored readings: none. Pull to my nest has not stored a provider response.';
  const newest = readings.reduce((max, row) => row.fetchedAt > max ? row.fetchedAt : max, readings[0].fetchedAt);
  const current = readings.filter((row) => row.fetchedAt === newest);
  let older = readings.filter((row) => row.fetchedAt !== newest);
  let withItems = true;
  let text = '';
  do {
    text = canonicalJson({
      note: 'Stored readings from a pull. A live provider response is labeled. A source that did not answer is left empty.',
      current: current.map((row) => readingMeta(row, withItems)),
      older: older.map((row) => readingMeta(row, false)),
    });
    if (text.length <= 3500) return text;
    if (withItems) withItems = false;
    else if (older.length) older = older.slice(0, -1);
    else break;
  } while (true);
  return text;
}

/** Null keeps the caller's report text. An array, even empty, replaces that text. */
export function chooseSeatBrief(report: string, readings: StoredReading[] | 'unread' | null): string {
  if (readings) return seatReadingBrief(readings);
  return report.slice(0, 3500);
}
