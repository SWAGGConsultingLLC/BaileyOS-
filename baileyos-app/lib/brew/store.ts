import { admin } from '../supabaseAdmin';
import { QUESTION_ID, publicTally, voteOption, type PublicTally, type VoteOption } from './question001';
import { newSalt, publicVoteRow } from './receipt';

async function counts(): Promise<Record<VoteOption, number>> {
  const totals: Record<VoteOption, number> = { A: 0, B: 0, C: 0 };
  const { data, error } = await admin().from('consensus_votes').select('option').eq('question_id', QUESTION_ID);
  if (error) throw new Error('tally failed');
  for (const row of data ?? []) {
    const option = voteOption(row.option);
    if (option) totals[option] += 1;
  }
  return totals;
}

export async function readPublicTally(): Promise<PublicTally> {
  return publicTally(await counts());
}

export async function readOwnVote(subjectId: string): Promise<VoteOption | null> {
  const { data, error } = await admin()
    .from('consensus_votes')
    .select('option')
    .eq('question_id', QUESTION_ID)
    .eq('subject_id', subjectId)
    .maybeSingle();
  if (error) throw new Error('vote read failed');
  return voteOption(data?.option);
}

export async function subjectIsVerified(subjectId: string): Promise<boolean> {
  const { data, error } = await admin()
    .from('verified_suite_subjects')
    .select('subject_id')
    .eq('subject_id', subjectId)
    .eq('provider', 'linkedin_oidc')
    .maybeSingle();
  if (error) throw new Error('subject read failed');
  return Boolean(data);
}

async function salt(): Promise<string> {
  const client = admin();
  const existing = await client.from('consensus_salts').select('salt').eq('question_id', QUESTION_ID).maybeSingle();
  if (existing.error) throw new Error('salt read failed');
  if (existing.data?.salt) return existing.data.salt;
  const created = newSalt();
  const inserted = await client.from('consensus_salts').insert({ question_id: QUESTION_ID, salt: created }).select('salt').maybeSingle();
  if (inserted.data?.salt) return inserted.data.salt;
  const again = await client.from('consensus_salts').select('salt').eq('question_id', QUESTION_ID).maybeSingle();
  if (!again.data?.salt) throw new Error('salt read failed');
  return again.data.salt;
}

export async function recordVote(subjectId: string, option: VoteOption): Promise<{ option: VoteOption; already: boolean }> {
  const prior = await readOwnVote(subjectId);
  if (prior) return { option: prior, already: true };
  const { error } = await admin().from('consensus_votes').insert({
    question_id: QUESTION_ID,
    subject_id: subjectId,
    option,
  });
  if (error?.code === '23505') {
    const saved = await readOwnVote(subjectId);
    if (!saved) throw new Error('vote write failed');
    return { option: saved, already: true };
  }
  if (error) throw new Error('vote write failed');
  return { option, already: false };
}

export async function readVerification(): Promise<{ tally: PublicTally; votes: { at: string; option: VoteOption; receipt: string }[] }> {
  const tally = await readPublicTally();
  const { data, error } = await admin()
    .from('consensus_votes')
    .select('option, created_at, subject_id')
    .eq('question_id', QUESTION_ID)
    .order('created_at', { ascending: true });
  if (error) throw new Error('log read failed');
  const rows = data ?? [];
  if (rows.length === 0) return { tally, votes: [] };
  const questionSalt = await salt();
  return {
    tally,
    votes: rows.flatMap(row => {
      const option = voteOption(row.option);
      if (!option || typeof row.subject_id !== 'string' || typeof row.created_at !== 'string') return [];
      return [publicVoteRow({ at: row.created_at, option, subjectId: row.subject_id }, questionSalt)];
    }),
  };
}

export async function readStewardQuestion(): Promise<{
  tally: PublicTally;
  votes: { at: string; option: VoteOption }[];
}> {
  const tally = await readPublicTally();
  const { data, error } = await admin()
    .from('consensus_votes')
    .select('option, created_at')
    .eq('question_id', QUESTION_ID)
    .order('created_at', { ascending: true });
  if (error) throw new Error('log read failed');
  return {
    tally,
    votes: (data ?? []).flatMap(row => {
      const option = voteOption(row.option);
      return option && typeof row.created_at === 'string' ? [{ at: row.created_at, option }] : [];
    }),
  };
}
