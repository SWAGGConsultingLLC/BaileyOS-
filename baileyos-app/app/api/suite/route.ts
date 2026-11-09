import { fetchSuiteUser } from '@/lib/suite/hosted';
import { decideSuiteSubject, suiteConfig } from '@/lib/suite/verify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ enabled: suiteConfig() !== null });
}

export async function POST(req: Request) {
  const config = suiteConfig();
  if (!config) return Response.json({ error: 'Suite sign-in is not configured.' }, { status: 404 });
  const header = req.headers.get('authorization') || '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) return Response.json({ error: 'Sign-in required.' }, { status: 401 });
  const decision = decideSuiteSubject(token, await fetchSuiteUser(token, config));
  if (!decision.ok) return Response.json({ error: decision.error }, { status: decision.status });
  return Response.json({ subject: decision.subject });
}
