import { memberId } from '@/lib/data-nest/member';
import { pullToNest } from '@/lib/data-nest/nestStore';
import { allow } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const NO_STORE = { 'Cache-Control': 'no-store' };

/** Signed-in pull. Nothing here runs on a schedule. */
export async function POST(req: Request) {
  const member = await memberId(req);
  if (!member.ok) return member.response;
  if (!allow('nest-pull:' + member.id, 8, 10 * 60 * 1000)) {
    return Response.json({ error: 'Too many pulls. Wait a few minutes.', code: 'rate_limit' }, { status: 429, headers: NO_STORE });
  }
  try {
    const pulled = await pullToNest(member.id);
    return Response.json({
      cell: pulled.cell,
      act: 'pull',
      record_sha256: pulled.recordSha256,
      input_sha256: pulled.inputSha256,
      snapshots: pulled.snapshots.map((row) => ({
        source: row.source,
        label: row.label,
        available: row.available,
        record_count: row.recordCount,
        payload_sha256: row.payloadSha256,
        http_status: row.httpStatus,
        error: row.error,
      })),
    }, { headers: NO_STORE });
  } catch (err) {
    const missing = err instanceof Error && /Supabase env not configured/.test(err.message);
    return Response.json({
      error: missing ? 'The nest store is not configured.' : 'The pull could not be stored.',
      code: missing ? 'not_configured' : 'store',
    }, { status: missing ? 503 : 502, headers: NO_STORE });
  }
}
