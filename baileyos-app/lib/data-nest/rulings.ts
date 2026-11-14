import { createClient } from '@supabase/supabase-js';

type RecordBody = { record_sha256?: string; prev_record_sha256?: string | null; created_at?: string; queen?: { ruling?: string } };

export async function latestRulingHash(): Promise<string | null> {
  const db = service();
  if (!db) return null;
  const { data, error } = await db.from('ruling_records').select('record_sha256').order('created_at', { ascending: false }).limit(1);
  if (error || !data?.[0]) return null;
  return typeof data[0].record_sha256 === 'string' ? data[0].record_sha256 : null;
}

export async function appendRuling(record: RecordBody): Promise<{ stored: boolean; reason?: string }> {
  const db = service();
  if (!db) return { stored: false, reason: 'The ruling log is not configured. Apply the ruling_records migration and set the service role key.' };
  if (!record.record_sha256 || !record.created_at || !record.queen?.ruling) return { stored: false, reason: 'The record is incomplete.' };
  const { error } = await db.from('ruling_records').insert({
    record_sha256: record.record_sha256,
    prev_record_sha256: record.prev_record_sha256 || null,
    ruling: record.queen.ruling,
    created_at: record.created_at,
    body: record,
  });
  if (error) return { stored: false, reason: 'The ruling log did not accept the record.' };
  return { stored: true };
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
  const latest = await db.from('ruling_records').select('record_sha256').order('created_at', { ascending: false }).limit(1);
  const count = await db.from('ruling_records').select('record_sha256', { count: 'exact', head: true });
  return {
    head: typeof latest.data?.[0]?.record_sha256 === 'string' ? latest.data[0].record_sha256 : null,
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
