import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null | undefined;
/** Returns null when auth isn't configured. Placement works without it. */
export function browserSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Client-only app. Current password docs use the implicit flow so a confirmation
  // or recovery link delivers the session in the URL. Do not send user metadata.
  client = url && key ? createClient(url, key, {
    auth: { flowType: 'implicit', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
  }) : null;
  return client;
}
