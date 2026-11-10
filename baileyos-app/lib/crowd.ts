import type { CheckInCard } from './checkInProfile';

/** A neighborhood is shown after this many different phones in the window. */
export const CROWD_MIN = 3;
export const CROWD_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type CrowdRow = {
  hex: string;
  phoneKey: string | null;
  at: number;
  card?: CheckInCard | null;
};

export type PublicNeighborhood = {
  hex: string;
  phones: number;
  cards: CheckInCard[];
};

export type PublicPlacements = {
  phones: number | null;
  neighborhoods: PublicNeighborhood[];
  zoom_in: boolean;
};

/**
 * Count distinct phones, not rows. A missing phone marker is a kept historical
 * check-in and does not count. Cards are included only inside a neighborhood
 * that meets the crowd rule.
 */
export function publicNeighborhoods(rows: CrowdRow[], onScreen: ReadonlySet<string>, now: number): PublicPlacements {
  const cutoff = now - CROWD_WINDOW_MS;
  const grouped = new Map<string, { phones: Set<string>; cards: Map<string, { at: number; card: CheckInCard }> }>();
  for (const row of rows) {
    if (!row.phoneKey || row.at < cutoff || !onScreen.has(row.hex)) continue;
    const group = grouped.get(row.hex) ?? { phones: new Set<string>(), cards: new Map() };
    group.phones.add(row.phoneKey);
    if (row.card && (group.cards.get(row.phoneKey)?.at ?? -1) < row.at) {
      group.cards.set(row.phoneKey, { at: row.at, card: row.card });
    }
    grouped.set(row.hex, group);
  }
  const neighborhoods: PublicNeighborhood[] = [];
  let phones = 0;
  for (const [hex, group] of grouped) {
    if (group.phones.size < CROWD_MIN) continue;
    phones += group.phones.size;
    neighborhoods.push({
      hex,
      phones: group.phones.size,
      cards: [...group.cards.values()].map(item => item.card),
    });
  }
  neighborhoods.sort((a, b) => a.hex.localeCompare(b.hex));
  return { phones, neighborhoods, zoom_in: false };
}

export function ownerPlacementBody(input: {
  status: 'placed' | 'duplicate';
  hex: string;
  placementId: number;
  linkToken: string;
  shared: boolean;
}) {
  return {
    status: input.status,
    h3: input.hex,
    placement_id: input.placementId,
    link_token: input.linkToken,
    shared_profile: input.shared,
  };
}
