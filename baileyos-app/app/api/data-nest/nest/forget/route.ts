import { memberId } from '@/lib/data-nest/member';
import { forgetMyNest } from '@/lib/data-nest/nestStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function POST(req: Request) {
  const member = await memberId(req);
  if (!member.ok) return member.response;
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  try {
    const cleared = await forgetMyNest(token);
    return Response.json({ forgotten: true, ...cleared }, { headers: NO_STORE });
  } catch {
    return Response.json({ error: 'The nest could not be cleared.', code: 'store' }, { status: 502, headers: NO_STORE });
  }
}
