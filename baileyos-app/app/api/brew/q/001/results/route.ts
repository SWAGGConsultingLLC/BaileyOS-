import { readPublicResults } from '@/lib/brew/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return Response.json(await readPublicResults(), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'The tally could not be read.' }, { status: 500 });
  }
}
