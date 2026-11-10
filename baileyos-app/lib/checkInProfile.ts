import { linkedInPresentation } from './identity';

/** Fields LinkedIn OIDC has been seen to send. None of these is a profile page. */
const PROFILE_URL_KEYS = ['profile', 'profile_url', 'public_profile_url'] as const;

export type CheckInCard = {
  name: string;
  photo: string | null;
  profileUrl: string | null;
};

function httpsUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Name and photo from the LinkedIn identity the Auth server stored.
 * A profile link is included only when that identity already contains one.
 * The subject id is never turned into a URL.
 */
export function checkInCard(data: unknown): CheckInCard | null {
  const shown = linkedInPresentation(data);
  if (!shown.name) return null;
  let profileUrl: string | null = null;
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    for (const key of PROFILE_URL_KEYS) {
      const found = httpsUrl(record[key]);
      if (found) {
        profileUrl = found;
        break;
      }
    }
  }
  return { name: shown.name, photo: shown.picture, profileUrl };
}

/** The box starts off. A card is attached only when the person turns it on and the sign-in is verified. */
export function shouldAttachCheckInProfile(input: { showLinkedIn: boolean; verified: boolean; card: CheckInCard | null }): boolean {
  return input.showLinkedIn === true && input.verified === true && input.card !== null;
}

export function publicCheckInCard(card: CheckInCard | null): CheckInCard | null {
  if (!card) return null;
  return { name: card.name, photo: card.photo, profileUrl: card.profileUrl };
}
