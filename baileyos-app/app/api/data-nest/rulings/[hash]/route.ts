import { readRuling } from '@/lib/data-nest/rulings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, context: { params: { hash: string } }) {
  const hash = context.params.hash || '';
  if (!/^[0-9a-f]{64}$/.test(hash)) return Response.json({ error: 'Unknown record.' }, { status: 404 });
  const body = await readRuling(hash);
  if (!body) return Response.json({ error: 'That record is not in the log.' }, { status: 404 });
  return Response.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
