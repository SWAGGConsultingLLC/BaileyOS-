import { loadLive, type LiveItem } from '@/lib/data-nest/liveFeeds';
import { acceptRingCenter, terrainImageUrl } from '@/lib/landing-stone/compass';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const LAYERS = new Set(['quakes', 'nws', 'roads', 'amber', 'silver', 'observation']);

async function elevationMeters(lat: number, lon: number): Promise<number | null> {
  try {
    const url = `https://epqs.nationalmap.gov/v1/json?x=${lon}&y=${lat}&units=Meters&wkid=4326`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const body = await res.json() as { value?: unknown };
    const value = Number(body.value);
    return Number.isFinite(value) ? Math.round(value) : null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const query = new URL(req.url);
  const center = acceptRingCenter(Number(query.searchParams.get('lat')), Number(query.searchParams.get('lon')));
  if (!center) {
    return Response.json({ error: 'Send a coarsened area (2 decimal degrees).' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
  let live: Awaited<ReturnType<typeof loadLive>> | null = null;
  let failed = false;
  try {
    live = await loadLive(center.lat, center.lon, 80);
  } catch {
    failed = true;
  }
  const wanted = ['nws_alerts', 'usgs', 'cdot'] as const;
  const names: Record<string, string> = {
    nws_alerts: 'National Weather Service',
    usgs: 'USGS earthquakes',
    cdot: 'CDOT CoTrip',
  };
  const feeds = wanted.map((id) => {
    const row = live?.freshness?.[id];
    if (failed || !row) return { id, name: names[id], status: 'unavailable', detail: 'feed unavailable' };
    if (row.available === false || row.error) return { id, name: names[id], status: 'unavailable', detail: row.error || 'feed unavailable' };
    if (!row.record_count) return { id, name: names[id], status: 'empty', detail: 'no published alerts. This is not an all-clear.' };
    return { id, name: names[id], status: 'live', detail: `${row.record_count} published` };
  });
  const items = (live?.items || [])
    .filter((item: LiveItem) => LAYERS.has(item.layer) && item.lat != null && item.lon != null)
    .slice(0, 30)
    .map((item) => ({
      id: item.id,
      title: item.title,
      layer: item.layer,
      lat: item.lat,
      lon: item.lon,
      sourceName: item.sourceName,
    }));
  const elevation = await elevationMeters(center.lat, center.lon);
  return Response.json({
    center,
    feeds,
    items,
    terrain: elevation == null
      ? { source: 'USGS 3DEP', status: 'not connected', elevation_m: null, image: null }
      : { source: 'USGS 3DEP', status: 'connected', elevation_m: elevation, image: terrainImageUrl(center.lat, center.lon) },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
