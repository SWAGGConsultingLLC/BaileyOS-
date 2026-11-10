import { createClient } from '@supabase/supabase-js';
import type { SuiteConfig, VerifiedSuiteUser } from './verify';

/** Asks the map Auth server who this token is. The token is not written into a table here. */
export async function fetchSuiteUser(token: string, config: SuiteConfig): Promise<VerifiedSuiteUser | null> {
  try {
    const client = createClient(config.url, config.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user?.id) return null;
    return { id: data.user.id, identities: data.user.identities };
  } catch {
    return null;
  }
}
