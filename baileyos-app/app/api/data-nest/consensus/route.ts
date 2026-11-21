import { memberId } from '@/lib/data-nest/member';
import { CONVENE_CODE, RECORD_CODE, runPythonJson } from '@/lib/data-nest/pythonRun';
import { appendLinkage, appendSequenced } from '@/lib/data-nest/rulings';
import { allow } from '@/lib/rateLimit';
import { coarsen, isCoarsened } from '@/lib/data-nest/geo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: Request) {
  const member = await memberId(req);
  if (!member.ok) return member.response;
  if (!allow('nest-queen:' + member.id, 20, 10 * 60 * 1000)) {
    return Response.json({ error: 'Too many Queen requests. Wait a few minutes.', code: 'rate_limit' }, { status: 429 });
  }
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return Response.json({ error: 'JSON required.', code: 'bad_request' }, { status: 400 }); }
  const lat = Number((body.cell as { lat?: unknown } | undefined)?.lat);
  const lon = Number((body.cell as { lon?: unknown } | undefined)?.lon);
  const cell = Number.isFinite(lat) && Number.isFinite(lon) && isCoarsened(lat, lon) ? coarsen(lat, lon) : null;
  const queen = runPythonJson(CONVENE_CODE, {
    report_canonical_json: body.report_canonical_json,
    report_sha256: body.report_sha256,
    input_canonical_json: body.input_canonical_json,
    gemini: body.gemini ?? null,
    kimi: body.kimi ?? null,
    payloads: body.payloads ?? null,
  });
  if (!queen.ok) return Response.json({ error: queen.error, code: 'python_unavailable' }, { status: 503 });
  const sealed = {
    input_sha256: body.input_sha256,
    report_sha256: body.report_sha256,
    input_canonical_json: body.input_canonical_json,
    report_canonical_json: body.report_canonical_json,
    report: body.report,
  };
  const asRecord = (value: { ok: true; data: unknown } | { ok: false; error: string }) => {
    if (!value.ok) return value;
    return { ok: true as const, data: value.data as { record_sha256?: string; prev_record_sha256?: string | null; sequence_number?: number; created_at?: string; queen?: { ruling?: string } } };
  };
  const saved = await appendSequenced(
    (prev, sequence) => asRecord(runPythonJson(RECORD_CODE, { sealed, queen: queen.data, prev, sequence })),
    () => asRecord(runPythonJson(RECORD_CODE, { op: 'genesis' })),
  );
  const fallback = saved.record ? null : asRecord(runPythonJson(RECORD_CODE, { sealed, queen: queen.data, prev: null, sequence: 1 }));
  const recordData = saved.record ?? (fallback && fallback.ok ? fallback.data as { record_sha256?: string } : null);
  if (!recordData) {
    const error = fallback && !fallback.ok ? fallback.error : saved.reason;
    return Response.json({ queen: queen.data, record: null, stored: false, error }, { status: 200 });
  }
  const hash = recordData.record_sha256;
  if (saved.stored && hash && cell) await appendLinkage({ userId: member.id, recordSha: hash, lat: cell.lat, lon: cell.lon });
  return Response.json({
    runtime: 'cpython',
    acted_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    queen: queen.data,
    record: recordData,
    stored: saved.stored,
    store_reason: saved.reason || null,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
