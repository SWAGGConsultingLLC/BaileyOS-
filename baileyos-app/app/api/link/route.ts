import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabaseAdmin';
import { linkToken, safeEqual } from '@/lib/crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function userId(req: NextRequest): Promise<string | null> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer /i, '');
  if (!token) return null;
  const { data, error } = await admin().auth.getUser(token);
  return error || !data.user ? null : data.user.id;
}

// Explicit opt-in link. The placement owner proves ownership with the token returned at placement time.
export async function POST(req: NextRequest) {
  const uid = await userId(req);
  if (!uid) return NextResponse.json({ error: 'Login required' }, { status: 401 });
  let body: { placement_id?: unknown; link_token?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }); }
  const id = Number(body.placement_id);
  if (!Number.isInteger(id) || typeof body.link_token !== 'string' || !safeEqual(body.link_token, linkToken(id)))
    return NextResponse.json({ error: 'Invalid link' }, { status: 403 });
  const { error } = await admin().from('desk_accounts').upsert({ user_id: uid, linked_placement_id: id });
  return error ? NextResponse.json({ error: 'Failed' }, { status: 500 }) : NextResponse.json({ linked: true });
}

export async function DELETE(req: NextRequest) {
  const uid = await userId(req);
  if (!uid) return NextResponse.json({ error: 'Login required' }, { status: 401 });
  const { error } = await admin().from('desk_accounts').upsert({ user_id: uid, linked_placement_id: null });
  return error ? NextResponse.json({ error: 'Failed' }, { status: 500 }) : NextResponse.json({ linked: false });
}
