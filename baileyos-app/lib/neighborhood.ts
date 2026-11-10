import { cellToBoundary, cellToLatLng, getResolution, latLngToCell, polygonToCells } from 'h3-js';
import { CONFIG } from './config';
import { destination } from './geo';

/** Neighborhood size. Resolution 7 is about 2.5 km across. */
export const H3_RES = 7;
const MAX_VIEW_KM = 80;

export type MapViewBox = { west: number; south: number; east: number; north: number };

export function neighborhoodHex(lat: number, lon: number): string {
  return latLngToCell(lat, lon, H3_RES);
}

export function hexCenter(hex: string): [number, number] {
  const [lat, lon] = cellToLatLng(hex);
  return [lat, lon];
}

/** Center of an old distance-and-direction wedge, snapped to today's neighborhood. */
export function legacyNeighborhoodHex(bandKm: number, sector: number): string {
  const [lat, lon] = destination(bandKm + CONFIG.bandKm / 2, sector * CONFIG.sectorDeg + CONFIG.sectorDeg / 2);
  return neighborhoodHex(lat, lon);
}

/** A fresh point inside the hex. The point is not saved. */
export function jitterInHex(hex: string): [number, number] {
  const center = hexCenter(hex);
  const ring = cellToBoundary(hex);
  let minLat = 90;
  let maxLat = -90;
  let minLon = 180;
  let maxLon = -180;
  for (const [lat, lon] of ring) {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
  }
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const lat = minLat + Math.random() * (maxLat - minLat);
    const lon = minLon + Math.random() * (maxLon - minLon);
    if (latLngToCell(lat, lon, H3_RES) === hex) return [lat, lon];
  }
  return center;
}

export function viewTooWide(view: MapViewBox): boolean {
  if (view.east <= view.west || view.north <= view.south) return true;
  const heightKm = (view.north - view.south) * 110.574;
  const mid = ((view.north + view.south) / 2) * Math.PI / 180;
  const widthKm = (view.east - view.west) * 111.32 * Math.cos(mid);
  return widthKm > MAX_VIEW_KM || heightKm > MAX_VIEW_KM;
}

export function hexesCovering(view: MapViewBox): string[] {
  if (viewTooWide(view)) return [];
  const loop: [number, number][] = [
    [view.north, view.west],
    [view.north, view.east],
    [view.south, view.east],
    [view.south, view.west],
  ];
  const cells = polygonToCells(loop, H3_RES);
  return cells.filter(cell => getResolution(cell) === H3_RES);
}

export function parseMapView(params: { get(name: string): string | null }): MapViewBox | { zoomIn: true } | null {
  const west = Number(params.get('west'));
  const south = Number(params.get('south'));
  const east = Number(params.get('east'));
  const north = Number(params.get('north'));
  if (![west, south, east, north].every(Number.isFinite)) return null;
  if (west < -180 || east > 180 || south < -90 || north > 90) return null;
  const view = { west, south, east, north };
  if (viewTooWide(view)) return { zoomIn: true };
  return view;
}
