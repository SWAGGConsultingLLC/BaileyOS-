import { CONFIG, SECTORS } from './config';

const R = 6371;
const rad = Math.PI / 180;

/** Distance (km) and initial bearing (deg, 0-360) from the origin to a point. */
export function polar(lat: number, lon: number) {
  const o = CONFIG.origin;
  const p1 = o.lat * rad, p2 = lat * rad, dp = p2 - p1, dl = (lon - o.lon) * rad;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  const d = 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  const b = (((Math.atan2(y, x) / rad) % 360) + 360) % 360;
  return { d, b };
}

/** Snap to a cell. Sector is clamped so a bearing that rounds to 360 can't escape the range. */
export function quantize(d: number, b: number) {
  return {
    band_km: Math.floor(d / CONFIG.bandKm) * CONFIG.bandKm,
    sector: Math.min(SECTORS - 1, Math.floor(b / CONFIG.sectorDeg))
  };
}

/** Point at distance km and bearing deg from the origin, as [lat, lon]. */
export function destination(km: number, bearing: number): [number, number] {
  const o = CONFIG.origin, dd = km / R, b = bearing * rad, p1 = o.lat * rad, l1 = o.lon * rad;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(dd) + Math.cos(p1) * Math.sin(dd) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(dd) * Math.cos(p1), Math.cos(dd) - Math.sin(p1) * Math.sin(p2));
  return [p2 / rad, l2 / rad];
}

/** A fresh random point inside a cell. Called on every render so dots can't be tracked. */
export function jitteredPoint(band_km: number, sector: number): [number, number] {
  const km = band_km + CONFIG.bandKm * (0.1 + 0.8 * Math.random());
  const deg = sector * CONFIG.sectorDeg + CONFIG.sectorDeg * (0.1 + 0.8 * Math.random());
  return destination(km, deg);
}
