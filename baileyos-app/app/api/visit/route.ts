import { NextRequest, NextResponse } from 'next/server';
import { allow } from '@/lib/rateLimit';
import { admin } from '@/lib/supabaseAdmin';
import { parseVisitCategory } from '@/lib/visit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Category and server time only. No name, IP, or device is stored.
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }); }
  const category = parseVisitCategory(body.category);
  if (!category) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const ip = (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  if (!allow('visit:' + ip, 30, 3600_000)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  const { error } = await admin().from('visit_events').insert({ category });
  if (error) return NextResponse.json({ error: 'Could not record the visit' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
