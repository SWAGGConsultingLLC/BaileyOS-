import { NextResponse } from 'next/server';
import { admin } from '@/lib/supabaseAdmin';
import { checkInCard, publicCheckInCard } from '@/lib/checkInProfile';
import { CROWD_WINDOW_MS, publicNeighborhoods, type CrowdRow } from '@/lib/crowd';
import { hexesCovering, parseMapView } from '@/lib/neighborhood';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };

function markerText(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value;
  if (value instanceof Uint8Array) return Buffer.from(value).toString('hex');
  return null;
}

// Public read for the hexes on screen. Phone markers are counted here and are not returned.
export async function GET(req: Request) {
  const view = parseMapView(new URL(req.url).searchParams);
  if (!view) return NextResponse.json({ error: 'Bad request' }, { status: 400, headers });
  if ('zoomIn' in view) return NextResponse.json({ phones: null, neighborhoods: [], zoom_in: true }, { headers });

  const onScreen = new Set(hexesCovering(view));
  const since = new Date(Date.now() - CROWD_WINDOW_MS).toISOString();
  const db = admin();
  const rows = await db.from('placements').select('id, h3, phone_key, created_at').gte('created_at', since).not('phone_key', 'is', null);
  if (rows.error) return NextResponse.json({ error: 'unavailable' }, { status: 500, headers });

  const relevant = (rows.data ?? []).filter(row => typeof row.h3 === 'string' && onScreen.has(row.h3) && markerText(row.phone_key));
  const ids = relevant.map(row => row.id);
  const cards = ids.length === 0
    ? { data: [], error: null }
    : await db.from('placement_cards').select('placement_id, display_name, photo_url, profile_url').in('placement_id', ids);
  if (cards.error) return NextResponse.json({ error: 'unavailable' }, { status: 500, headers });
  const byId = new Map((cards.data ?? []).map(card => [card.placement_id, card]));
  const crowdRows: CrowdRow[] = relevant.flatMap(row => {
    const phoneKey = markerText(row.phone_key);
    if (!phoneKey || typeof row.h3 !== 'string' || typeof row.created_at !== 'string') return [];
    const saved = byId.get(row.id);
    const card = saved
      ? publicCheckInCard(checkInCard({ name: saved.display_name, picture: saved.photo_url, profile_url: saved.profile_url }))
      : null;
    return [{ hex: row.h3, phoneKey, at: Date.parse(row.created_at), card }];
  });
  return NextResponse.json(publicNeighborhoods(crowdRows, onScreen, Date.now()), { headers });
}
