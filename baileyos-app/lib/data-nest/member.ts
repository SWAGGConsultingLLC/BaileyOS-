import { createClient } from '@supabase/supabase-js';

export async function memberId(req: Request): Promise<{ ok: true; id: string } | { ok: false; response: Response }> {
  const header = req.headers.get('authorization') || '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  if (!token || !url || !key) {
    return { ok: false, response: Response.json({ error: 'Sign in is required.', code: 'auth' }, { status: 401 }) };
  }
  try {
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user?.id || !data.user.email_confirmed_at) {
      return { ok: false, response: Response.json({ error: 'Sign in is required.', code: 'auth' }, { status: 401 }) };
    }
    return { ok: true, id: data.user.id };
  } catch {
    return { ok: false, response: Response.json({ error: 'Sign in is required.', code: 'auth' }, { status: 401 }) };
  }
}
