import { memberId } from '@/lib/data-nest/member';
import { allow } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const member = await memberId(req);
  if (!member.ok) return member.response;
  if (!allow('nest-place:' + member.id, 20, 10 * 60 * 1000)) {
    return Response.json({ error: 'Too many place lookups.', code: 'rate_limit' }, { status: 429 });
  }
  let body: { query?: unknown };
  try { body = await req.json(); } catch { return Response.json({ error: 'JSON required.', code: 'bad_request' }, { status: 400 }); }
  const query = typeof body.query === 'string' ? body.query.trim().slice(0, 160) : '';
  if (query.length < 3) return Response.json({ error: 'Type a place or street address.', code: 'bad_request' }, { status: 400 });
  const url = new URL('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress');
  url.searchParams.set('address', query);
  url.searchParams.set('benchmark', 'Public_AR_Current');
  url.searchParams.set('format', 'json');
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'BaileyOS-DataNest/1.0 (https://baileyos-app.vercel.app)' }, signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return Response.json({ error: 'The Census geocoder did not answer.', code: 'upstream' }, { status: 502 });
    const data = await res.json() as { result?: { addressMatches?: { matchedAddress?: string; coordinates?: { x?: number; y?: number } }[] } };
    const match = data.result?.addressMatches?.[0];
    const lon = match?.coordinates?.x;
    const lat = match?.coordinates?.y;
    if (typeof lat !== 'number' || typeof lon !== 'number') {
      return Response.json({ error: 'No match. Try a street address, or tap the map.', code: 'none' }, { status: 404 });
    }
    return Response.json({
      label: match?.matchedAddress || query,
      lat,
      lon,
      sourceName: 'U.S. Census Bureau geocoder',
      sourceUrl: 'https://geocoding.geo.census.gov/',
    });
  } catch {
    return Response.json({ error: 'The Census geocoder did not answer.', code: 'upstream' }, { status: 502 });
  }
}
