/**
 * Personal Data Nest choices. They stay on this device and are stripped from every request.
 * Two people on the same trip share the same route and the same public feeds.
 * Each phone orders and phrases those results from its own on-device profile.
 * Profiles are not shared between devices, and they are not sent to the server or to an AI.
 */

export const PROFILE_KEY = 'baileyos_nest_profile_v1';
export const TUNE_SEEN_KEY = 'baileyos_nest_tune_seen_v1';

export const INTERESTS = [
  { id: 'roads', label: 'Roads and traffic' },
  { id: 'weather', label: 'Weather' },
  { id: 'safety', label: 'Safety alerts (AMBER/Silver)' },
  { id: 'quakes', label: 'Earthquakes' },
  { id: 'veterans', label: 'Veteran resources' },
  { id: 'largerText', label: 'Larger text' },
] as const;

export type InterestId = (typeof INTERESTS)[number]['id'];

export const GENERATION_OPTIONS = ['Silent', 'Boomer', 'Gen X', 'Xennial', 'Millennial', 'Gen Z', 'Gen Alpha'] as const;

export type NestProfile = {
  birthYear: number | null;
  origin: string;
  /** Empty means show the label derived from the birth year. */
  selfLabel: string;
  interests: InterestId[];
};

export const EXAMPLE_PROFILES: { id: string; title: string; profile: NestProfile }[] = [
  {
    id: 'west-colorado-1981',
    title: '1981, Western Colorado',
    profile: { birthYear: 1981, origin: 'Western Colorado', selfLabel: '', interests: ['roads', 'weather', 'safety'] },
  },
  {
    id: 'illinois-1948',
    title: '1948, Central Illinois, Vietnam veteran',
    profile: { birthYear: 1948, origin: 'Central Illinois', selfLabel: '', interests: ['weather', 'veterans', 'largerText'] },
  },
];

const PROFILE_KEYS = new Set([
  'birthYear', 'origin', 'homeRegion', 'interests', 'generation', 'selfLabel', 'selfIdentified',
  'largerText', 'profile', 'nestProfile',
]);

const KIND_INTEREST: Record<string, InterestId> = {
  chain: 'roads',
  closure: 'roads',
  crash: 'roads',
  other: 'roads',
  weather: 'weather',
  observation: 'weather',
  amber: 'safety',
  silver: 'safety',
  quake: 'quakes',
};

const DEFAULT_RANK: InterestId[] = ['roads', 'weather', 'safety', 'quakes', 'veterans'];

export function generationLine(year: number): string | null {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) return null;
  if (year >= 1977 && year <= 1983) return `${year}: Xennial (Gen X and Millennial line)`;
  const base = year <= 1945 ? 'Silent'
    : year <= 1964 ? 'Boomer'
    : year <= 1980 ? 'Gen X'
    : year <= 1996 ? 'Millennial'
    : year <= 2012 ? 'Gen Z'
    : 'Gen Alpha';
  if (year >= 1995 && year <= 1998) return `${year}: ${base} (Millennial and Gen Z line)`;
  return `${year}: ${base}`;
}

/** The label on screen. A self-identified label replaces the year label. */
export function shownGeneration(profile: Pick<NestProfile, 'birthYear' | 'selfLabel'>): string | null {
  const own = profile.selfLabel.trim();
  if (own) return own;
  if (profile.birthYear == null) return null;
  return generationLine(profile.birthYear);
}

export function emptyProfile(): NestProfile {
  return { birthYear: null, origin: '', selfLabel: '', interests: [] };
}

export function readProfile(storage: Pick<Storage, 'getItem'> | null): NestProfile | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NestProfile>;
    const year = typeof parsed.birthYear === 'number' ? parsed.birthYear : null;
    const origin = typeof parsed.origin === 'string' ? parsed.origin.slice(0, 80) : '';
    const selfLabel = typeof parsed.selfLabel === 'string' ? parsed.selfLabel.slice(0, 40) : '';
    const interests = Array.isArray(parsed.interests)
      ? parsed.interests.filter((id): id is InterestId => INTERESTS.some(item => item.id === id))
      : [];
    return { birthYear: year, origin, selfLabel, interests };
  } catch {
    return null;
  }
}

export function writeProfile(storage: Pick<Storage, 'setItem'> | null, profile: NestProfile): void {
  storage?.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function clearProfile(storage: Pick<Storage, 'removeItem'> | null): void {
  storage?.removeItem(PROFILE_KEY);
}

export function tuneWasSeen(storage: Pick<Storage, 'getItem'> | null): boolean {
  return storage?.getItem(TUNE_SEEN_KEY) === '1';
}

export function markTuneSeen(storage: Pick<Storage, 'setItem'> | null): void {
  storage?.setItem(TUNE_SEEN_KEY, '1');
}

/** Drop personal profile fields before a request is sent. */
export function stripProfile(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripProfile);
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (PROFILE_KEYS.has(key)) continue;
    out[key] = stripProfile(item);
  }
  return out;
}

export function sectionRank(kind: string, interests: readonly InterestId[]): number {
  const interest = KIND_INTEREST[kind];
  if (!interest) return 80;
  const selected = interests.indexOf(interest);
  if (selected >= 0) return selected;
  return 40 + DEFAULT_RANK.indexOf(interest);
}

export function wantsLargerText(interests: readonly InterestId[]): boolean {
  return interests.includes('largerText');
}

export function wantsVeterans(interests: readonly InterestId[]): boolean {
  return interests.includes('veterans');
}

export const VETERAN_LINKS = [
  { label: 'U.S. Department of Veterans Affairs', href: 'https://www.va.gov/' },
  { label: 'Veterans Crisis Line: call 988, then press 1', href: 'https://www.veteranscrisisline.net/' },
] as const;
