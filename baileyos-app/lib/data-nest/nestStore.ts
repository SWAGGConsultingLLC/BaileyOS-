import { admin } from '@/lib/supabaseAdmin';
import { DEFAULT_CENTER } from '@/lib/landing-stone/compass';
import { loadLive } from './liveFeeds';
import {
  DEFAULT_CELL_ID,
  PULL_RADIUS_KM,
  newInputSalt,
  recordSha,
  saltedInputSha,
  snapshotsFromLive,
  toStoredReading,
  type SnapshotDraft,
  type StoredReading,
} from './nestPull';

export type NestCell = {
  id: string;
  lat: number;
  lon: number;
  label: string;
  placed: 'user_nest' | 'default';
};

export type NestAct = {
  act: string;
  recordSha256: string | null;
  createdAt: string;
};

const DEFAULT_CELL: NestCell = {
  id: DEFAULT_CELL_ID,
  lat: DEFAULT_CENTER.lat,
  lon: DEFAULT_CENTER.lon,
  label: DEFAULT_CENTER.name,
  placed: 'default',
};

function num(value: unknown, fallback: number): number {
  const next = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(next) ? next : fallback;
}

export async function resolveUserCell(userId: string): Promise<NestCell> {
  const db = admin();
  const nest = await db.from('user_nest').select('cell_id').eq('user_id', userId).maybeSingle();
  const cellId = nest.data && typeof nest.data.cell_id === 'string' ? nest.data.cell_id : '';
  if (!cellId) return DEFAULT_CELL;
  const cell = await db.from('area_cells').select('id, lat, lon, label').eq('id', cellId).maybeSingle();
  if (!cell.data || typeof cell.data.id !== 'string') return DEFAULT_CELL;
  return {
    id: cell.data.id,
    lat: num(cell.data.lat, DEFAULT_CELL.lat),
    lon: num(cell.data.lon, DEFAULT_CELL.lon),
    label: typeof cell.data.label === 'string' && cell.data.label ? cell.data.label : DEFAULT_CELL.label,
    placed: 'user_nest',
  };
}

export async function loadUserReadings(userId: string): Promise<StoredReading[]> {
  const db = admin();
  const { data, error } = await db
    .from('user_readings')
    .select('created_at, feed_snapshots(source, source_url, fetched_at, source_timestamp, http_status, available, record_count, payload_sha256, payload, error)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(80);
  if (error) throw new Error('stored readings could not be read');
  const readings: StoredReading[] = [];
  for (const row of data || []) {
    const snapshot = (row as { feed_snapshots?: unknown }).feed_snapshots;
    const body = Array.isArray(snapshot) ? snapshot[0] : snapshot;
    if (!body || typeof body !== 'object') continue;
    const reading = toStoredReading(body as Record<string, unknown>);
    if (reading) readings.push(reading);
  }
  return readings;
}

export async function loadUserActs(userId: string): Promise<NestAct[]> {
  const db = admin();
  const { data, error } = await db
    .from('user_acts')
    .select('act, record_sha256, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(40);
  if (error) throw new Error('acts could not be read');
  return (data || []).flatMap((row) => {
    if (typeof row.act !== 'string' || typeof row.created_at !== 'string') return [];
    return [{
      act: row.act,
      recordSha256: typeof row.record_sha256 === 'string' ? row.record_sha256 : null,
      createdAt: row.created_at,
    }];
  });
}

async function removePull(userId: string, snapshotIds: string[]) {
  const db = admin();
  if (snapshotIds.length) {
    await db.from('user_readings').delete().eq('user_id', userId).in('snapshot_id', snapshotIds);
    await db.from('feed_snapshots').delete().in('id', snapshotIds);
  }
}

export async function pullToNest(userId: string): Promise<{
  cell: NestCell;
  recordSha256: string;
  inputSha256: string;
  snapshots: { source: string; label: string; available: boolean; recordCount: number; payloadSha256: string; httpStatus: number | null; error: string | null }[];
}> {
  const cell = await resolveUserCell(userId);
  const live = await loadLive(cell.lat, cell.lon, PULL_RADIUS_KM);
  const drafts = snapshotsFromLive(cell.id, live);
  const db = admin();
  const inserted = await db.from('feed_snapshots').insert(drafts.map(storeRow)).select('id, source');
  const ids = (inserted.data || []).flatMap((row) => typeof row.id === 'string' && typeof row.source === 'string' ? [{ id: row.id, source: row.source }] : []);
  if (inserted.error || ids.length !== drafts.length) {
    if (ids.length) await removePull(userId, ids.map((row) => row.id));
    throw new Error('the pull could not be stored');
  }
  const readings = await db.from('user_readings').insert(ids.map((row) => ({ user_id: userId, snapshot_id: row.id })));
  if (readings.error) {
    await removePull(userId, ids.map((row) => row.id));
    throw new Error('the pull could not be stored');
  }
  const salt = newInputSalt();
  const inputSha256 = saltedInputSha(salt, cell.id, PULL_RADIUS_KM);
  const recordSha256 = recordSha(cell.id, drafts);
  const act = await db.from('user_acts').insert({
    user_id: userId,
    act: 'pull',
    record_sha256: recordSha256,
    input_sha256: inputSha256,
    input_salt: salt,
  });
  if (act.error) {
    await removePull(userId, ids.map((row) => row.id));
    throw new Error('the pull could not be stored');
  }
  return {
    cell,
    recordSha256,
    inputSha256,
    snapshots: drafts.map((row) => ({
      source: row.source,
      label: row.payload.label,
      available: row.available,
      recordCount: row.record_count,
      payloadSha256: row.payload_sha256,
      httpStatus: row.http_status,
      error: row.error,
    })),
  };
}

function storeRow(row: SnapshotDraft) {
  return {
    cell_id: row.cell_id,
    source: row.source,
    source_url: row.source_url,
    fetched_at: row.fetched_at,
    source_timestamp: row.source_timestamp,
    http_status: row.http_status,
    available: row.available,
    record_count: row.record_count,
    payload_sha256: row.payload_sha256,
    payload: row.payload,
    error: row.error,
  };
}

export async function forgetMyNest(accessToken: string): Promise<{ user_readings: number; user_acts: number; user_nest: number }> {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  if (!url || !key || !accessToken) throw new Error('sign in required');
  const res = await fetch(`${url}/rest/v1/rpc/forget_my_nest`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
    cache: 'no-store',
  });
  const body = await res.json().catch(() => ({})) as { user_readings?: unknown; user_acts?: unknown; user_nest?: unknown; message?: unknown };
  if (!res.ok) throw new Error(typeof body.message === 'string' ? body.message : 'the nest could not be cleared');
  const count = (value: unknown) => typeof value === 'number' ? value : 0;
  return {
    user_readings: count(body.user_readings),
    user_acts: count(body.user_acts),
    user_nest: count(body.user_nest),
  };
}
