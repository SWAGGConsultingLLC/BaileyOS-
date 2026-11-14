import { memberId } from '@/lib/data-nest/member';
import { deleteLinkage } from '@/lib/data-nest/rulings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const member = await memberId(req);
  if (!member.ok) return member.response;
  const result = await deleteLinkage(member.id);
  return Response.json({
    ...result,
    kept: 'Sealed decision records stay in the chain. This clears only the private link between your account and those records.',
  }, { headers: { 'Cache-Control': 'no-store' } });
}
