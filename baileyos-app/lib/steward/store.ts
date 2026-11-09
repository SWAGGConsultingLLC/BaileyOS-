import { admin } from '../supabaseAdmin';
import type { StewardGrant } from './decide';

/** Records the verified subject. Failures are thrown to the caller, which stays closed. */
export async function rememberSuiteSubject(subject: string): Promise<void> {
  const { error } = await admin().from('verified_suite_subjects').upsert(
    { subject_id: subject, last_seen_at: new Date().toISOString() },
    { onConflict: 'subject_id' }
  );
  if (error) throw new Error('remember failed');
}

export async function readStewardGrant(subject: string): Promise<StewardGrant | null> {
  const { data, error } = await admin()
    .from('steward_grants')
    .select('subject_id, revoked_at')
    .eq('subject_id', subject)
    .maybeSingle();
  if (error) throw new Error('grant read failed');
  if (!data) return null;
  return { subjectId: data.subject_id, revokedAt: data.revoked_at };
}
