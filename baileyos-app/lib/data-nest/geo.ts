/** Location math shared by the HUD. Distances match the Python validator's haversine. */

const EARTH_KM = 6371.0088;
const RAD = Math.PI / 180;

export const TRAVEL_MPS = 5 * 0.44704;
export const STATIONARY_MPS = 2 * 0.44704;

export function haversineKm(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const p1 = lat1 * RAD;
  const p2 = lat2 * RAD;
  const dphi = p2 - p1;
  const dl = (lon2 - lon1) * RAD;
  const a = Math.sin(dphi / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function bearingDeg(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const p1 = lat1 * RAD;
  const p2 = lat2 * RAD;
  const dl = (lon2 - lon1) * RAD;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return ((Math.atan2(y, x) / RAD) % 360 + 360) % 360;
}

export function angleDelta(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Same local equirectangular point-to-segment distance the Python validator uses. */
export function pointToSegmentKm(plon: number, plat: number, alon: number, alat: number, blon: number, blat: number): number {
  const kx = Math.cos(plat * RAD) * RAD * EARTH_KM;
  const ky = RAD * EARTH_KM;
  const ax = (alon - plon) * kx;
  const ay = (alat - plat) * ky;
  const bx = (blon - plon) * kx;
  const by = (blat - plat) * ky;
  const dx = bx - ax;
  const dy = by - ay;
  const seg2 = dx * dx + dy * dy;
  const t = seg2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / seg2));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

export function distanceToLineKm(lon: number, lat: number, line: number[][]): number | null {
  if (line.length < 2) return null;
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    if (!a || !b || a.length < 2 || b.length < 2) continue;
    best = Math.min(best, pointToSegmentKm(lon, lat, a[0], a[1], b[0], b[1]));
  }
  return Number.isFinite(best) ? best : null;
}

/** About 1 km at two decimal degrees. Precise fixes are not sent to the server. */
export function coarsen(lat: number, lon: number, places = 2): { lat: number; lon: number } {
  const f = 10 ** places;
  return { lat: Math.round(lat * f) / f, lon: Math.round(lon * f) / f };
}

export function isCoarsened(lat: number, lon: number): boolean {
  const c = coarsen(lat, lon);
  return Math.abs(lat - c.lat) < 1e-9 && Math.abs(lon - c.lon) < 1e-9;
}

export function isAhead(heading: number | null, bearing: number, cone = 50): boolean {
  if (heading == null || !Number.isFinite(heading)) return false;
  return angleDelta(heading, bearing) <= cone;
}

/** Minutes at the current speed. Null below about 5 mph so a stopped phone does not invent an ETA. */
export function etaMinutes(distanceKm: number, speedMps: number | null): number | null {
  if (speedMps == null || !Number.isFinite(speedMps) || speedMps < TRAVEL_MPS) return null;
  const hours = distanceKm / (speedMps * 3.6);
  return Number.isFinite(hours) ? hours * 60 : null;
}

export function shouldAcceptFix(
  prev: { t: number; lat: number; lon: number } | null,
  next: { t: number; lat: number; lon: number },
  minMs = 8000,
  minMeters = 40,
): boolean {
  if (!prev) return true;
  if (next.t - prev.t >= minMs) return true;
  return haversineKm(prev.lon, prev.lat, next.lon, next.lat) * 1000 >= minMeters;
}
