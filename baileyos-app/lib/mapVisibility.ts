import type { CheckInCard } from './checkInProfile';
import { publicMapBody, type PublicPin, type PublicPlacements } from './crowd';

/** A check-in stays on the map for this long. The Compass purge uses the same 28 days. */
export const CHECKIN_VISIBLE_MS = 28 * 24 * 60 * 60 * 1000;

const HEX = /^[0-9a-f]{15}$/;

export type StoredCheckIn = {
  subjectId: string;
  hex: string;
  at: number;
  id?: number;
  card: CheckInCard | null;
};

export type VisibleNeighborhood = {
  hex: string;
  pins: PublicPin[];
};

function pinFromCard(card: CheckInCard | null): PublicPin {
  if (!card?.name) return { name: null, photo: null, profileUrl: null };
  return { name: card.name, photo: card.photo, profileUrl: card.profileUrl };
}

/**
 * Pins a viewer is allowed to see.
 * Logged-out viewers get nothing. A viewer sees only the neighborhood of their
 * newest check-in, and only the newest check-in of each person there.
 * A missing card stays anonymous: the pin is kept, without a name or photo.
 */
export function visibleNeighborhoods(input: {
  viewerSubjectId: string | null;
  rows: StoredCheckIn[];
  onScreen: ReadonlySet<string>;
  now: number;
}): VisibleNeighborhood[] {
  if (!input.viewerSubjectId) return [];
  const cutoff = input.now - CHECKIN_VISIBLE_MS;
  const latest = new Map<string, StoredCheckIn>();
  for (const row of input.rows) {
    if (!row.subjectId || !HEX.test(row.hex)) continue;
    if (!Number.isFinite(row.at) || row.at < cutoff || row.at > input.now) continue;
    const prev = latest.get(row.subjectId);
    const newer = !prev || row.at > prev.at || (row.at === prev.at && (row.id ?? 0) >= (prev.id ?? 0));
    if (newer) latest.set(row.subjectId, row);
  }
  const mine = latest.get(input.viewerSubjectId);
  if (!mine || !input.onScreen.has(mine.hex)) return [];
  const pins = [...latest.values()]
    .filter(row => row.hex === mine.hex)
    .sort((a, b) => {
      const byName = (a.card?.name ?? '\uffff').localeCompare(b.card?.name ?? '\uffff');
      return byName === 0 ? a.subjectId.localeCompare(b.subjectId) : byName;
    })
    .map(row => pinFromCard(row.card));
  return pins.length === 0 ? [] : [{ hex: mine.hex, pins }];
}

/** Response for /api/placements. The viewer id is never copied into the body. */
export function mapPlacements(input: {
  people: number;
  zoomIn: boolean;
  viewerSubjectId: string | null;
  rows: StoredCheckIn[];
  onScreen: readonly string[];
  now: number;
}): PublicPlacements {
  const neighborhoods = input.zoomIn
    ? []
    : visibleNeighborhoods({
      viewerSubjectId: input.viewerSubjectId,
      rows: input.rows,
      onScreen: new Set(input.onScreen),
      now: input.now,
    });
  return publicMapBody({ people: input.people, neighborhoods, zoom_in: input.zoomIn });
}
