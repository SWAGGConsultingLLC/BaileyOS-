import { NextRequest, NextResponse } from 'next/server';
import { CONFIG } from '@/lib/config';
import { polar, quantize } from '@/lib/geo';
import { hmacHex, linkToken } from '@/lib/crypto';
import { allow } from '@/lib/rateLimit';
import { admin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

// Raw lat/lon live only in this function's locals. Do not log the request body.
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail('Bad request'); }
  const { lat, lon, accuracy_m, device_token, timestamp } = body;

  if (!num(lat) || !num(lon) || !num(accuracy_m) || !num(timestamp)) return fail('Bad request');
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return fail('Bad request');
  if (typeof device_token !== 'string' || device_token.length < 16 || device_token.length > 128) return fail('Bad request');

  const ip = (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  if (!allow('ip:' + ip, 30, 3600_000) || !allow('tok:' + device_token, 6, 3600_000)) return fail('Too many requests', 429);

  const now = Date.now();
  if (Math.abs(now - timestamp) > CONFIG.clientSkewMs) return fail('Clock skew too large');
  if (accuracy_m > CONFIG.maxAccuracyM || accuracy_m < 0) return fail('Location not precise enough');

  const { d, b } = polar(lat, lon);
  if (d > CONFIG.maxKm) return fail(`Out of range (more than ${CONFIG.maxKm} km from center)`);
  const cell = quantize(d, b);

  // Window and hour come from the server clock, not the client.
  const windowMs = Number(process.env.DEDUPE_WINDOW_HOURS || 24) * 3600_000;
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const key = hmacHex(`${device_token}:${windowStart}`);
  const hour = new Date(Math.floor(now / 3600_000) * 3600_000).toISOString();

  const { data, error } = await admin().rpc('insert_placement', {
    p_band: cell.band_km, p_sector: cell.sector, p_hour: hour, p_key: '\\x' + key
  });
  if (error) return fail('Could not record placement', 500);

  if (data == null) return NextResponse.json({ status: 'duplicate', ...cell });
  return NextResponse.json({ status: 'placed', ...cell, placement_id: data, link_token: linkToken(Number(data)) });
}
