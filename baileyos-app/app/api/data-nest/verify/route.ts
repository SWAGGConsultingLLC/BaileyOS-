import { RECORD_CODE, runPythonJson } from '@/lib/data-nest/pythonRun';
import { allow } from '@/lib/rateLimit';
import { clientIp } from '@/lib/oracle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!allow('nest-verify:' + ip, 30, 10 * 60 * 1000)) {
    return Response.json({ error: 'Too many verify requests.', code: 'rate_limit' }, { status: 429 });
  }
  let body: { record?: unknown };
  try { body = await req.json(); } catch { return Response.json({ error: 'JSON required.', code: 'bad_request' }, { status: 400 }); }
  const text = JSON.stringify(body.record ?? null);
  if (text.length > 200_000) return Response.json({ error: 'Record is too large.', code: 'bad_request' }, { status: 400 });
  const checked = runPythonJson(RECORD_CODE, { op: 'verify', record: body.record });
  if (!checked.ok) return Response.json({ error: checked.error, code: 'python_unavailable' }, { status: 503 });
  return Response.json(checked.data, { headers: { 'Cache-Control': 'no-store' } });
}
