import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabaseAdmin';
import { safeEqual } from '@/lib/crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Call daily from a scheduler: curl -X POST -H "Authorization: Bearer $CRON_SECRET" .../api/retention
export async function POST(req: NextRequest) {
  const given = (req.headers.get('authorization') || '').replace(/^Bearer /i, '');
  const want = process.env.CRON_SECRET || '';
  if (!want || !safeEqual(given, want)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { data, error } = await admin().rpc('purge_old_placements', { p_days: Number(process.env.RETENTION_DAYS || 28) });
  return error ? NextResponse.json({ error: 'Failed' }, { status: 500 }) : NextResponse.json({ deleted: data });
}
