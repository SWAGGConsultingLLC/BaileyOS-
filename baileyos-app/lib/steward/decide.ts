const SUBJECT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type StewardGrant = { subjectId: string; revokedAt: string | null };

/** True only for an active grant of this exact verified subject. Email is not an input. */
export function isActiveSteward(subject: string, grant: StewardGrant | null): boolean {
  if (!SUBJECT.test(subject) || !grant) return false;
  if (grant.subjectId !== subject) return false;
  return grant.revokedAt === null || grant.revokedAt === '';
}

export type SuiteAuthority = { subject: string; steward: boolean };

export async function completeSuiteLogin(subject: string, db: {
  remember: (subject: string) => Promise<void>;
  readGrant: (subject: string) => Promise<StewardGrant | null>;
}): Promise<SuiteAuthority> {
  let grant: StewardGrant | null = null;
  try {
    await db.remember(subject);
    grant = await db.readGrant(subject);
  } catch {
    grant = null;
  }
  return { subject, steward: isActiveSteward(subject, grant) };
}
