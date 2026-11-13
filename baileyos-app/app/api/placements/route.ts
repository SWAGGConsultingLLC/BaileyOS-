import { NextResponse } from 'next/server';
import { admin } from '@/lib/supabaseAdmin';
import { mapPlacements, CHECKIN_VISIBLE_MS, type StoredCheckIn } from '@/lib/mapVisibility';
import type { CheckInCard } from '@/lib/checkInProfile';
import { hexesCovering, parseMapView } from '@/lib/neighborhood';
import { fetchSuiteUser } from '@/lib/suite/hosted';
import { decideSuiteSubject, suiteConfig } from '@/lib/suite/verify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };

async function peopleCount(): Promise<number | null> {
  const tally = await admin().from('checkin_live_tallies').select('people').eq('id', true).maybeSingle();
  if (tally.error || typeof tally.data?.people !== 'number') return null;
  return tally.data.people;
}

/** Verified LinkedIn subject, or null when the caller is logged out. */
async function viewerSubject(req: Request): Promise<string | null> {
  const header = req.headers.get('authorization') || '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const config = suiteConfig();
  if (!config) return null;
  const decision = decideSuiteSubject(token, await fetchSuiteUser(token, config));
  if (!decision.ok) return null;
  const verified = await admin()
    .from('verified_suite_subjects')
    .select('subject_id')
    .eq('subject_id', decision.subject)
    .eq('provider', 'linkedin_oidc')
    .maybeSingle();
  if (verified.error || !verified.data) return null;
  return decision.subject;
}

function cardFromRow(card: { display_name: string | null; photo_url: string | null; profile_url: string | null }): CheckInCard | null {
  if (typeof card.display_name !== 'string' || card.display_name.length < 1) return null;
  const photo = typeof card.photo_url === 'string' && card.photo_url.startsWith('https://') ? card.photo_url : null;
  const profileUrl = typeof card.profile_url === 'string' && card.profile_url.startsWith('https://') ? card.profile_url : null;
  return { name: card.display_name, photo, profileUrl };
}

/**
 * Live rows for people who have a check-in in the viewer's neighborhood,
 * including a newer row in another neighborhood so only the newest pin counts.
 * Returns null when the read fails.
 */
async function loadRows(viewerId: string, onScreen: string[]): Promise<StoredCheckIn[] | null> {
  const since = new Date(Date.now() - CHECKIN_VISIBLE_MS).toISOString();
  const db = admin();
  const mine = await db.from('placements')
    .select('h3')
    .eq('subject_id', viewerId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1);
  if (mine.error) return null;
  const hex = mine.data?.[0]?.h3;
  if (typeof hex !== 'string' || !onScreen.includes(hex)) return [];

  const company = await db.from('placements')
    .select('subject_id')
    .eq('h3', hex)
    .gte('created_at', since)
    .not('subject_id', 'is', null);
  if (company.error || !company.data) return null;
  const subjects = [...new Set(company.data.flatMap(row => typeof row.subject_id === 'string' ? [row.subject_id] : []))];
  if (!subjects.includes(viewerId)) subjects.push(viewerId);

  const live = await db.from('placements')
    .select('id, subject_id, h3, created_at')
    .in('subject_id', subjects)
    .gte('created_at', since);
  if (live.error || !live.data) return null;

  const ids = live.data.flatMap(row => typeof row.id === 'number' ? [row.id] : []);
  const cardRows = ids.length === 0
    ? { data: [] as { placement_id: number; display_name: string | null; photo_url: string | null; profile_url: string | null }[], error: null }
    : await db.from('placement_cards').select('placement_id, display_name, photo_url, profile_url').in('placement_id', ids);
  if (cardRows.error || !cardRows.data) return null;
  const cards = new Map(cardRows.data.map(card => [card.placement_id, card]));

  return live.data.flatMap(row => {
    if (typeof row.subject_id !== 'string' || typeof row.h3 !== 'string' || typeof row.created_at !== 'string' || typeof row.id !== 'number') return [];
    const at = Date.parse(row.created_at);
    if (!Number.isFinite(at)) return [];
    return [{
      subjectId: row.subject_id,
      hex: row.h3,
      at,
      id: row.id,
      card: cardFromRow(cards.get(row.id) ?? { display_name: null, photo_url: null, profile_url: null }),
    }];
  });
}

// Pins are returned only for the verified viewer's own neighborhood.
export async function GET(req: Request) {
  const view = parseMapView(new URL(req.url).searchParams);
  if (!view) return NextResponse.json({ error: 'Bad request' }, { status: 400, headers });

  const people = await peopleCount();
  if (people == null) return NextResponse.json({ error: 'unavailable' }, { status: 500, headers });
  const now = Date.now();
  if ('zoomIn' in view) {
    return NextResponse.json(mapPlacements({
      people, zoomIn: true, viewerSubjectId: null, rows: [], onScreen: [], now,
    }), { headers });
  }

  const onScreen = hexesCovering(view);
  const viewer = await viewerSubject(req);
  const rows = viewer && onScreen.length > 0 ? await loadRows(viewer, onScreen) : [];
  if (rows == null) return NextResponse.json({ error: 'unavailable' }, { status: 500, headers });
  return NextResponse.json(mapPlacements({
    people, zoomIn: false, viewerSubjectId: viewer, rows, onScreen, now,
  }), { headers });
}
