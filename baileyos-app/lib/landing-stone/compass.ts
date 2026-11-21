import { bearingDeg, coarsen, haversineKm, isCoarsened } from '@/lib/data-nest/geo';

export const STEWARD_BEARING = 180;
export const LIGHTS_WIN = 'If this compass and the lights disagree, the lights win.';
/** Grand Junction, already coarsened to about a kilometer. Used only when the viewer does not opt in. */
export const DEFAULT_CENTER = { lat: 39.06, lon: -108.55, name: 'Grand Junction, CO', label: 'default' as const };

export function acceptRingCenter(lat: number, lon: number): { lat: number; lon: number } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !isCoarsened(lat, lon)) return null;
  return coarsen(lat, lon);
}

export function telemetryRadius(distanceKm: number, maxKm = 80): number {
  const span = Math.max(0, Math.min(distanceKm, maxKm)) / maxKm;
  return Math.round((48 + span * 58) * 10) / 10;
}

export function placeRelative(
  center: { lat: number; lon: number },
  point: { lat: number | null; lon: number | null },
): { bearing: number; distanceKm: number; radius: number } | null {
  if (point.lat == null || point.lon == null || !Number.isFinite(point.lat) || !Number.isFinite(point.lon)) return null;
  const distanceKm = haversineKm(center.lon, center.lat, point.lon, point.lat);
  const bearing = bearingDeg(center.lon, center.lat, point.lon, point.lat);
  return {
    bearing: Math.round(bearing),
    distanceKm: Math.round(distanceKm * 10) / 10,
    radius: telemetryRadius(distanceKm),
  };
}

export function terrainImageUrl(lat: number, lon: number): string {
  const west = (lon - 0.1).toFixed(2);
  const south = (lat - 0.1).toFixed(2);
  const east = (lon + 0.1).toFixed(2);
  const north = (lat + 0.1).toFixed(2);
  const params = new URLSearchParams({
    bbox: `${west},${south},${east},${north}`,
    bboxSR: '4326',
    size: '256,256',
    format: 'jpg',
    f: 'image',
  });
  return `https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage?${params.toString()}`;
}

const SEAT_BEARINGS: Record<string, { seat: string; bearing: number }> = {
  A: { seat: '01', bearing: 90 },
  B: { seat: '02', bearing: 270 },
  C: { seat: '03', bearing: 0 },
  D: { seat: '04', bearing: 45 },
  E: { seat: '05', bearing: 315 },
};

const FEED_BEARINGS: Record<string, number> = {
  nws_alerts: 120,
  nws_observation: 150,
  usgs: 30,
  cdot: 210,
};

export type SeatFace = {
  id: string;
  name: string;
  seat: string;
  bearing: number;
  status: 'disabled' | 'not configured' | 'ready' | string;
};

export type FeedMark = { id: string; bearing: number; reason: string };

export function placeSeats(slots: { id: string; name: string; status: string }[]): SeatFace[] {
  return slots.map((slot) => {
    const known = SEAT_BEARINGS[slot.id];
    return {
      id: slot.id,
      name: slot.name,
      seat: known?.seat || slot.id,
      bearing: known?.bearing ?? STEWARD_BEARING,
      status: slot.status,
    };
  }).filter((seat) => seat.bearing !== STEWARD_BEARING);
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ')[0] || '';
}

export function dissentBearings(seats: SeatFace[], reviewers: string[]): number[] {
  const wanted = new Set(reviewers.map(slug).filter(Boolean));
  return seats.filter((seat) => wanted.has(slug(seat.name)) || wanted.has(seat.id.toLowerCase())).map((seat) => seat.bearing);
}

export function feedMarks(sources: { id?: string; status?: string; record_count?: number }[], vetoes: { feed_id?: string; rule_id?: string; feed_status?: string }[]): FeedMark[] {
  const marks: FeedMark[] = [];
  const seen = new Set<string>();
  for (const veto of vetoes) {
    const id = typeof veto.feed_id === 'string' ? veto.feed_id : '';
    const bearing = FEED_BEARINGS[id];
    if (bearing === undefined || seen.has(id)) continue;
    seen.add(id);
    marks.push({ id, bearing, reason: `${veto.rule_id || 'veto'} ${veto.feed_status || ''}`.trim() });
  }
  for (const source of sources) {
    const id = typeof source.id === 'string' ? source.id : '';
    const bearing = FEED_BEARINGS[id];
    if (!id || bearing === undefined || seen.has(id) || id === 'crime') continue;
    const count = typeof source.record_count === 'number' ? source.record_count : 0;
    const status = source.status;
    const alert = status === 'fail' || status === 'degraded' || count > 0;
    if (!alert) continue;
    seen.add(id);
    marks.push({
      id,
      bearing,
      reason: status === 'fail' || status === 'degraded' ? status : `${count} published`,
    });
  }
  return marks;
}

export function pointOnRing(cx: number, cy: number, radius: number, bearing: number): { x: number; y: number } {
  const rad = (bearing * Math.PI) / 180;
  return {
    x: Math.round((cx + radius * Math.sin(rad)) * 10) / 10,
    y: Math.round((cy - radius * Math.cos(rad)) * 10) / 10,
  };
}
