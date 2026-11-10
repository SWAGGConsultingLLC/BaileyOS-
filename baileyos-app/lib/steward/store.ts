import { admin } from '../supabaseAdmin';
import type { StewardGrant } from './decide';

/** Records the map auth user id together with the LinkedIn subject. A different pair is refused. */
export async function rememberSuiteSubject(subject: string, providerSub: string): Promise<void> {
  const client = admin();
  const existing = await client
    .from('verified_suite_subjects')
    .select('subject_id, provider, provider_sub')
    .eq('subject_id', subject)
    .maybeSingle();
  if (existing.error) throw new Error('remember failed');
  if (existing.data && (existing.data.provider !== 'linkedin_oidc' || existing.data.provider_sub !== providerSub)) {
    throw new Error('remember failed');
  }
  const other = await client
    .from('verified_suite_subjects')
    .select('subject_id')
    .eq('provider', 'linkedin_oidc')
    .eq('provider_sub', providerSub)
    .maybeSingle();
  if (other.error) throw new Error('remember failed');
  if (other.data && other.data.subject_id !== subject) throw new Error('remember failed');
  const { error } = await client.from('verified_suite_subjects').upsert(
    {
      subject_id: subject,
      provider: 'linkedin_oidc',
      provider_sub: providerSub,
      last_seen_at: new Date().toISOString(),
    },
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
