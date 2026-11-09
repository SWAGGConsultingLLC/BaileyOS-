import { NextRequest, NextResponse } from 'next/server';
import { allow } from '@/lib/rateLimit';
import { preparePlacement } from '@/lib/placeRequest';
import { admin } from '@/lib/supabaseAdmin';
import { linkToken } from '@/lib/crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Raw lat/lon live only inside preparePlacement. Do not log the request body.
// This route does not read an email and does not look up a member.
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail('Bad request'); }
  const ip = (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  const prepared = preparePlacement({ body, now: Date.now(), ip, allow });
  if (!prepared.ok) return fail(prepared.error, prepared.status);

  const { data, error } = await admin().rpc('insert_placement', {
    p_band: prepared.cell.band_km,
    p_sector: prepared.cell.sector,
    p_hour: prepared.hour,
    p_key: '\\x' + prepared.key,
  });
  if (error) return fail('Could not record placement', 500);

  if (data == null) return NextResponse.json({ status: 'duplicate', ...prepared.cell });
  return NextResponse.json({ status: 'placed', ...prepared.cell, placement_id: data, link_token: linkToken(Number(data)) });
}
