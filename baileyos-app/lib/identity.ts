const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

export type ProfileVisibility = {
  displayName: string;
  showName: boolean;
  showPhoto: boolean;
};

/** Name and picture from a LinkedIn identity. Ids, subjects, and email addresses are dropped. */
export function linkedInPresentation(data: unknown): { name: string | null; picture: string | null } {
  if (!data || typeof data !== 'object') return { name: null, picture: null };
  const record = data as Record<string, unknown>;
  const rawName = typeof record.name === 'string' ? record.name.trim() : '';
  const name = rawName
    && rawName.length <= 80
    && !rawName.includes('@')
    && !UUID.test(rawName)
    ? rawName
    : null;
  let picture: string | null = null;
  if (typeof record.picture === 'string') {
    try {
      const url = new URL(record.picture.trim());
      if (url.protocol === 'https:') picture = url.toString();
    } catch {
      picture = null;
    }
  }
  return { name, picture };
}

/** What this person sees above the map. A missing profile uses the LinkedIn name and photo. */
export function visibleIdentity(
  linkedIn: { name: string | null; picture: string | null },
  profile: ProfileVisibility | null,
): { name: string | null; picture: string | null } {
  if (!profile) return linkedIn;
  return {
    name: profile.showName ? profile.displayName : null,
    picture: profile.showPhoto ? linkedIn.picture : null,
  };
}
