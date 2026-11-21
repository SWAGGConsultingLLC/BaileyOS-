import sample from '../../validation/sample_input.json';
import { bearingDeg, distanceToLineKm, etaMinutes, haversineKm, isAhead } from './geo';
import type { LiveItem } from './liveFeeds';

export type SceneGeometry =
  | { type: 'Point'; coordinates: [number, number] }
  | { type: 'LineString'; coordinates: [number, number][] };

export type SceneFeature = {
  id: string;
  layer: 'corridor' | 'nodes' | 'user' | 'quakes' | 'nws' | 'roads' | 'amber' | 'silver' | 'observation';
  title: string;
  summary: string;
  geometry: SceneGeometry;
  live: boolean;
  simulated: boolean;
  sourceName: string;
  sourceUrl: string;
  agency: string;
  issuedAt: string | null;
  expiresAt: string | null;
  kind: string;
  priority: number;
};

const PRIORITY: Record<string, number> = {
  closure: 1,
  crash: 1,
  chain: 1,
  weather: 2,
  amber: 3,
  silver: 3,
  quake: 4,
  observation: 5,
  other: 5,
  node: 8,
  corridor: 9,
  user: 0,
};

export function corridorLine(): number[][] {
  const features = sample.corridor.features as { geometry: { coordinates: number[][] } }[];
  return features[0]?.geometry.coordinates || [];
}

export function sampleNodes(): { id: string; name: string; lon: number; lat: number; type: string }[] {
  return sample.nodes.map((node) => ({ id: node.id, name: node.name, lon: node.lon, lat: node.lat, type: node.type }));
}

export function buildScene(items: LiveItem[], user: { lon: number; lat: number } | null): SceneFeature[] {
  const features: SceneFeature[] = [];
  if (user) {
    features.push({
      id: 'user',
      layer: 'user',
      title: 'You',
      summary: 'This position stays on this device.',
      geometry: { type: 'Point', coordinates: [user.lon, user.lat] },
      live: false,
      simulated: false,
      sourceName: 'This device',
      sourceUrl: '',
      agency: 'You',
      issuedAt: null,
      expiresAt: null,
      kind: 'user',
      priority: 0,
    });
  }
  for (const item of items) {
    if (item.lon == null || item.lat == null) {
      features.push(itemFeature(item, { type: 'Point', coordinates: [0, 0] }, true));
      continue;
    }
    features.push(itemFeature(item, { type: 'Point', coordinates: [item.lon, item.lat] }, false));
  }
  return features;
}

function itemFeature(item: LiveItem, geometry: SceneGeometry, unlocated: boolean): SceneFeature {
  return {
    id: item.id,
    layer: item.layer,
    title: item.title,
    summary: unlocated ? `${item.summary} No map point was published.` : item.summary,
    geometry: unlocated ? { type: 'Point', coordinates: [0, 0] } : geometry,
    live: true,
    simulated: false,
    sourceName: item.sourceName,
    sourceUrl: item.sourceUrl,
    agency: item.agency,
    issuedAt: item.issuedAt,
    expiresAt: item.expiresAt,
    kind: item.kind,
    priority: PRIORITY[item.kind] ?? 5,
  };
}

export type AheadCard = {
  id: string;
  title: string;
  summary: string;
  agency: string;
  sourceUrl: string;
  sourceName: string;
  issuedAt: string | null;
  expiresAt: string | null;
  kind: string;
  distanceKm: number | null;
  etaMinutes: number | null;
  ahead: boolean;
};

export function aheadCards(
  features: SceneFeature[],
  user: { lon: number; lat: number } | null,
  heading: number | null,
  speedMps: number | null,
): AheadCard[] {
  if (!user) return [];
  const cards: AheadCard[] = [];
  for (const feature of features) {
    if (!feature.live || feature.geometry.type !== 'Point') continue;
    const [lon, lat] = feature.geometry.coordinates;
    if (lon === 0 && lat === 0) continue;
    const distanceKm = haversineKm(user.lon, user.lat, lon, lat);
    const bearing = bearingDeg(user.lon, user.lat, lon, lat);
    const ahead = isAhead(heading, bearing);
    cards.push({
      id: feature.id,
      title: feature.title,
      summary: feature.summary,
      agency: feature.agency,
      sourceUrl: feature.sourceUrl,
      sourceName: feature.sourceName,
      issuedAt: feature.issuedAt,
      expiresAt: feature.expiresAt,
      kind: feature.kind,
      distanceKm,
      etaMinutes: etaMinutes(distanceKm, speedMps),
      ahead: heading == null ? false : ahead,
    });
  }
  const pool = heading == null ? cards : cards.filter((card) => card.ahead);
  const list = (pool.length ? pool : cards).slice();
  list.sort((a, b) => (PRIORITY[a.kind] ?? 9) - (PRIORITY[b.kind] ?? 9) || (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
  return list.slice(0, 8);
}

export function corridorDistanceKm(lon: number, lat: number): number | null {
  return distanceToLineKm(lon, lat, corridorLine());
}
