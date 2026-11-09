import { createClient } from '@supabase/supabase-js';
import type { SuiteConfig, VerifiedSuiteUser } from './verify';

/** Asks the 360 Auth server who this token is. The token is not sent to the map database. */
export async function fetchSuiteUser(token: string, config: SuiteConfig): Promise<VerifiedSuiteUser | null> {
  try {
    const client = createClient(config.url, config.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user?.id) return null;
    return { id: data.user.id };
  } catch {
    return null;
  }
}
