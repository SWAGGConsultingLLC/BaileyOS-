import { memberId } from '@/lib/data-nest/member';
import { loadLive } from '@/lib/data-nest/liveFeeds';
import { isCoarsened } from '@/lib/data-nest/geo';
import { allow } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: Request) {
  const member = await memberId(req);
  if (!member.ok) return member.response;
  if (!allow('nest-feeds:' + member.id, 30, 10 * 60 * 1000)) {
    return Response.json({ error: 'Too many feed refreshes. Wait a few minutes.', code: 'rate_limit' }, { status: 429 });
  }
  let body: { lat?: unknown; lon?: unknown; radiusKm?: unknown };
  try { body = await req.json(); } catch { return Response.json({ error: 'JSON required.', code: 'bad_request' }, { status: 400 }); }
  const lat = Number(body.lat);
  const lon = Number(body.lon);
  const radiusKm = Number(body.radiusKm ?? 80);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !isCoarsened(lat, lon)) {
    return Response.json({ error: 'Send a coarsened area (2 decimal degrees).', code: 'bad_request' }, { status: 400 });
  }
  const live = await loadLive(lat, lon, Number.isFinite(radiusKm) ? radiusKm : 80);
  return Response.json(live, { headers: { 'Cache-Control': 'no-store' } });
}
