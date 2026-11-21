import { placeRelative } from '@/lib/landing-stone/compass';

export const CANON_HREF = 'https://swaggconsultingllc.github.io/BaileyOS-/canon/';

export type ReadingLabel = 'live provider response' | 'provider did not answer' | 'needs setup';

export type ReadingItem = {
  id: string;
  title: string;
  lat: number | null;
  lon: number | null;
  agency: string;
  issuedAt: string | null;
  sourceName: string;
  kind: string;
};

export type StoredReading = {
  source: string;
  sourceUrl: string;
  fetchedAt: string;
  sourceTimestamp: string | null;
  httpStatus: number | null;
  available: boolean;
  recordCount: number;
  payloadSha256: string;
  error: string | null;
  label: ReadingLabel;
  items: ReadingItem[];
};

/** Latest stored points, placed from the cell with the shared compass math. */
export function compassMarks(center: { lat: number; lon: number }, readings: StoredReading[]) {
  const newest = readings.reduce((max, row) => row.fetchedAt > max ? row.fetchedAt : max, readings[0]?.fetchedAt || '');
  return readings.filter((row) => row.fetchedAt === newest).flatMap((reading) => reading.items.flatMap((item) => {
    const spot = placeRelative(center, { lat: item.lat, lon: item.lon });
    if (!spot) return [];
    return [{
      id: `${reading.source}:${item.id}`,
      title: item.title,
      source: reading.source,
      label: reading.label,
      ...spot,
    }];
  }));
}
