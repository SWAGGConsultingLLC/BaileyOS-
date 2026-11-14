import { createClient } from '@supabase/supabase-js';

type RecordBody = {
  record_sha256?: string;
  prev_record_sha256?: string | null;
  sequence_number?: number;
  created_at?: string;
  queen?: { ruling?: string };
};

const NOT_CONFIGURED = 'The ruling log is not configured. Apply the ruling sequencer migration and set the service role key.';

function conflict(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === '40001' || error.code === '23505' || /chain head moved/i.test(error.message || '');
}

function missingLog(error: { message?: string } | null): boolean {
  return /append_ruling_record|schema cache|does not exist|sequence_number/i.test(error?.message || '');
}

async function readHead(db: NonNullable<ReturnType<typeof service>>): Promise<{ prev: string | null; sequence: number } | { error: string }> {
  const { data, error } = await db.from('ruling_records').select('record_sha256, sequence_number').order('sequence_number', { ascending: false }).limit(1);
  if (error) return { error: missingLog(error) ? NOT_CONFIGURED : 'The ruling log could not be read.' };
  const row = data?.[0];
  if (!row || typeof row.record_sha256 !== 'string') return { prev: null, sequence: 0 };
  const sequence = typeof row.sequence_number === 'number' ? row.sequence_number : 0;
  return { prev: row.record_sha256, sequence };
}

export async function latestRulingHash(): Promise<string | null> {
  const db = service();
  if (!db) return null;
  const head = await readHead(db);
  if ('error' in head) return null;
  return head.prev;
}

export async function appendSequenced(
  build: (prev: string | null, sequence: number) => { ok: true; data: RecordBody } | { ok: false; error: string },
  genesis: () => { ok: true; data: RecordBody } | { ok: false; error: string },
): Promise<{ stored: boolean; reason?: string; record?: RecordBody }> {
  const db = service();
  if (!db) return { stored: false, reason: NOT_CONFIGURED };
  let last = 'The ruling log did not accept the record.';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const head = await readHead(db);
    if ('error' in head) return { stored: false, reason: head.error };
    if (head.sequence === 0) {
      const first = genesis();
      if (!first.ok) return { stored: false, reason: first.error };
      const inserted = await db.rpc('append_ruling_record', { payload: first.data });
      if (inserted.error && !conflict(inserted.error)) {
        return { stored: false, reason: missingLog(inserted.error) ? NOT_CONFIGURED : 'The ruling log did not accept the record.' };
      }
      if (inserted.error) continue;
    }
    const current = await readHead(db);
    if ('error' in current) return { stored: false, reason: current.error };
    if (!current.prev) continue;
    const built = build(current.prev, current.sequence + 1);
    if (!built.ok) return { stored: false, reason: built.error };
    const saved = await db.rpc('append_ruling_record', { payload: built.data });
    if (!saved.error) return { stored: true, record: built.data };
    if (conflict(saved.error)) {
      last = 'The chain head moved. The write was retried.';
      continue;
    }
    return { stored: false, reason: missingLog(saved.error) ? NOT_CONFIGURED : 'The ruling log did not accept the record.' };
  }
  return { stored: false, reason: last };
}

export async function listRulingBodies(): Promise<{ configured: boolean; records: unknown[]; error?: string }> {
  const db = service();
  if (!db) return { configured: false, records: [] };
  const count = await db.from('ruling_records').select('record_sha256', { count: 'exact', head: true });
  if (count.error) return { configured: false, records: [], error: 'The ruling log could not be read.' };
  if ((count.count || 0) > 5000) return { configured: true, records: [], error: 'The ruling log is too long to check in one read.' };
  const { data, error } = await db.from('ruling_records').select('body').order('sequence_number', { ascending: true }).limit(5000);
  if (error) return { configured: false, records: [], error: 'The ruling log could not be read.' };
  return { configured: true, records: (data || []).map((row) => row.body).filter((body) => body && typeof body === 'object') };
}

export async function readRuling(hash: string): Promise<unknown | null> {
  const db = service();
  if (!db || !/^[0-9a-f]{64}$/.test(hash)) return null;
  const { data, error } = await db.from('ruling_records').select('body').eq('record_sha256', hash).maybeSingle();
  if (error || !data) return null;
  return data.body ?? null;
}

const LINK_MS = 28 * 24 * 60 * 60 * 1000;

export async function rulingHead(): Promise<{ head: string | null; count: number }> {
  const db = service();
  if (!db) return { head: null, count: 0 };
  const head = await readHead(db);
  const count = await db.from('ruling_records').select('record_sha256', { count: 'exact', head: true });
  return {
    head: 'error' in head ? null : head.prev,
    count: count.count || 0,
  };
}

export async function appendLinkage(input: { userId: string; recordSha: string; lat: number; lon: number }): Promise<void> {
  const db = service();
  if (!db) return;
  const cutoff = new Date(Date.now() - LINK_MS).toISOString();
  await db.from('ruling_requests').delete().lt('created_at', cutoff);
  await db.from('ruling_requests').insert({
    user_id: input.userId,
    record_sha256: input.recordSha,
    coarse_lat: input.lat,
    coarse_lon: input.lon,
    created_at: new Date().toISOString(),
  });
}

export async function deleteLinkage(userId: string): Promise<{ deleted: boolean; reason?: string }> {
  const db = service();
  if (!db) return { deleted: false, reason: 'The request log is not configured.' };
  const { error } = await db.from('ruling_requests').delete().eq('user_id', userId);
  if (error) return { deleted: false, reason: 'The request log could not be cleared.' };
  return { deleted: true };
}

function service() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
