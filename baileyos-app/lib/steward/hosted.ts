import { admin } from '../supabaseAdmin';
import { identityFromAuthUser, type GrantState, type IdentityResult } from './authorize';

/** Asks the Auth server who this access token is. Do not use getSession for this decision. */
export async function supabaseIdentity(token: string): Promise<IdentityResult> {
  try {
    const { data, error } = await admin().auth.getUser(token);
    if (error || !data.user) return { ok: false, status: 401, error: 'Sign-in required.' };
    const identity = identityFromAuthUser(data.user);
    if (!identity) return { ok: false, status: 401, error: 'Sign-in required.' };
    return { ok: true, identity };
  } catch {
    return { ok: false, status: 403, error: 'Steward checks are not configured. This workspace is closed.' };
  }
}

/** Reads the active grant by user id. Any database error closes the check. */
export async function supabaseGrant(userId: string): Promise<GrantState> {
  try {
    const { data, error } = await admin()
      .from('steward_grants')
      .select('user_id')
      .eq('user_id', userId)
      .is('revoked_at', null)
      .maybeSingle();
    if (error) return 'unavailable';
    return data ? 'active' : 'absent';
  } catch {
    return 'unavailable';
  }
}
