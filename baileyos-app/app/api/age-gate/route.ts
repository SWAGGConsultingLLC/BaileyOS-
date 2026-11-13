import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { allow } from '@/lib/rateLimit';
import { parseAgeGateLog } from '@/lib/ageGateLog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function ageGateClient() {
  const url = (process.env.AGE_GATE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = (process.env.AGE_GATE_ANON_KEY || '').trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// Writes only event type, time, and optional dwell_ms to the main project's
// age_gate_events table. Does not touch age_verifications. No identity is sent.
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }); }
  const parsed = parseAgeGateLog(body);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const ip = (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  if (!allow('age-gate:' + ip, 60, 3600_000)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  const db = ageGateClient();
  if (!db) return NextResponse.json({ error: 'Age gate logging is not configured' }, { status: 503 });
  const { error } = parsed.event === 'dwell'
    ? await db.from('age_gate_events').insert({ event: 'dwell', dwell_ms: parsed.dwell_ms })
    : await db.from('age_gate_events').insert({ event: parsed.event });
  if (error) return NextResponse.json({ error: 'Could not record the event' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
