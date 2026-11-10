import { readVerification } from '@/lib/brew/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return Response.json(await readVerification());
  } catch {
    return Response.json({ error: 'The vote log could not be read.' }, { status: 500 });
  }
}
