import { RECORD_CODE, runPythonJson } from '@/lib/data-nest/pythonRun';
import { rulingHead } from '@/lib/data-nest/rulings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const head = await rulingHead();
  const day = new Date().toISOString().slice(0, 10);
  const anchor = runPythonJson(RECORD_CODE, { op: 'anchor', day, head_sha256: head.head, record_count: head.count });
  if (!anchor.ok) return Response.json({ error: anchor.error, code: 'python_unavailable' }, { status: 503 });
  return Response.json({
    ...(anchor.data as object),
    publish: 'Nothing is posted from this endpoint. Publishing the daily head needs the owner\'s approval.',
  }, { headers: { 'Cache-Control': 'no-store' } });
}
