import type { CheckInCard } from './checkInProfile';

export type PublicPin = {
  name: string | null;
  photo: string | null;
  profileUrl: string | null;
};

export type PublicNeighborhood = {
  hex: string;
  pins: PublicPin[];
};

export type PublicPlacements = {
  people: number;
  neighborhoods: PublicNeighborhood[];
  zoom_in: boolean;
};

function pinFromUnknown(value: unknown): PublicPin | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as { name?: unknown; photo?: unknown; profileUrl?: unknown };
  if (row.name != null && typeof row.name !== 'string') return null;
  const name = typeof row.name === 'string' && row.name.trim().length > 0 ? row.name : null;
  const photo = name && typeof row.photo === 'string' && row.photo.startsWith('https://') ? row.photo : null;
  const profileUrl = name && typeof row.profileUrl === 'string' && row.profileUrl.startsWith('https://') ? row.profileUrl : null;
  return { name, photo, profileUrl };
}

/** Shape returned to the map. Anonymous pins stay, without a name or photo. */
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
      const row = item as { hex?: unknown; pins?: unknown };
      if (typeof row.hex !== 'string' || !/^[0-9a-f]{15}$/.test(row.hex)) continue;
      const pins = Array.isArray(row.pins)
        ? row.pins.flatMap(pin => {
          const parsed = pinFromUnknown(pin);
          return parsed ? [parsed] : [];
        })
        : [];
      if (pins.length === 0) continue;
      pins.sort((a, b) => (a.name ?? '\uffff').localeCompare(b.name ?? '\uffff'));
      neighborhoods.push({ hex: row.hex, pins });
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
