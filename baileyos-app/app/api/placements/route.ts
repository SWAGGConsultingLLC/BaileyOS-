import { NextResponse } from 'next/server';
import { admin } from '@/lib/supabaseAdmin';
import { publicMapBody } from '@/lib/crowd';
import { hexesCovering, parseMapView } from '@/lib/neighborhood';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };

async function peopleCount(): Promise<number | null> {
  const tally = await admin().from('checkin_live_tallies').select('people').eq('id', true).maybeSingle();
  if (tally.error || typeof tally.data?.people !== 'number') return null;
  return tally.data.people;
}

// Public read: signed-in people count plus named pins on screen. No anonymous pins.
export async function GET(req: Request) {
  const view = parseMapView(new URL(req.url).searchParams);
  if (!view) return NextResponse.json({ error: 'Bad request' }, { status: 400, headers });

  if ('zoomIn' in view) {
    const people = await peopleCount();
    if (people == null) return NextResponse.json({ error: 'unavailable' }, { status: 500, headers });
    return NextResponse.json(publicMapBody({ people, neighborhoods: [], zoom_in: true }), { headers });
  }

  const onScreen = hexesCovering(view);
  const result = await admin().rpc('public_map_checkins', { p_hexes: onScreen });
  if (result.error || result.data == null) return NextResponse.json({ error: 'unavailable' }, { status: 500, headers });
  const payload = result.data as { people?: unknown; neighborhoods?: unknown };
  return NextResponse.json(publicMapBody({
    people: payload.people,
    neighborhoods: payload.neighborhoods,
    zoom_in: false,
  }), { headers });
}
