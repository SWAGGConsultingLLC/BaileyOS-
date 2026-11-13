import type { CheckInCard } from './checkInProfile';

export type PublicNeighborhood = {
  hex: string;
  cards: CheckInCard[];
};

export type PublicPlacements = {
  people: number;
  neighborhoods: PublicNeighborhood[];
  zoom_in: boolean;
};

function cardFromUnknown(value: unknown): CheckInCard | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as { name?: unknown; photo?: unknown; profileUrl?: unknown };
  if (typeof row.name !== 'string' || row.name.length < 1) return null;
  const photo = typeof row.photo === 'string' && row.photo.startsWith('https://') ? row.photo : null;
  const profileUrl = typeof row.profileUrl === 'string' && row.profileUrl.startsWith('https://') ? row.profileUrl : null;
  return { name: row.name, photo, profileUrl };
}

/** Shape returned to the map. Anonymous pins are not included. */
export function publicMapBody(input: {
  people: unknown;
  neighborhoods: unknown;
  zoom_in: boolean;
}): PublicPlacements {
  const people = typeof input.people === 'number' && Number.isFinite(input.people) && input.people >= 0
    ? Math.floor(input.people)
    : 0;
  const neighborhoods: PublicNeighborhood[] = [];
  if (Array.isArray(input.neighborhoods)) {
    for (const item of input.neighborhoods) {
      if (!item || typeof item !== 'object') continue;
      const row = item as { hex?: unknown; cards?: unknown };
      if (typeof row.hex !== 'string' || !/^[0-9a-f]{15}$/.test(row.hex)) continue;
      const cards = Array.isArray(row.cards)
        ? row.cards.flatMap(card => {
            const parsed = cardFromUnknown(card);
            return parsed ? [parsed] : [];
          })
        : [];
      if (cards.length === 0) continue;
      neighborhoods.push({ hex: row.hex, cards });
    }
  }
  neighborhoods.sort((a, b) => a.hex.localeCompare(b.hex));
  return { people, neighborhoods, zoom_in: input.zoom_in === true };
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
