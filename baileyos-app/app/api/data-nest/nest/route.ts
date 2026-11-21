import { memberId } from '@/lib/data-nest/member';
import { CANON_HREF } from '@/lib/data-nest/nestPull';
import { loadUserActs, loadUserReadings, resolveUserCell } from '@/lib/data-nest/nestStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(req: Request) {
  const member = await memberId(req);
  if (!member.ok) return member.response;
  try {
    const [cell, readings, acts] = await Promise.all([
      resolveUserCell(member.id),
      loadUserReadings(member.id),
      loadUserActs(member.id),
    ]);
    return Response.json({
      cell,
      readings: readings.map((row) => ({
        source: row.source,
        source_url: row.sourceUrl,
        fetched_at: row.fetchedAt,
        available: row.available,
        record_count: row.recordCount,
        payload_sha256: row.payloadSha256,
        error: row.error,
        label: row.label,
        items: row.items,
      })),
      acts: acts.map((row) => ({
        act: row.act,
        record_sha256: row.recordSha256,
        created_at: row.createdAt,
      })),
      canon: { href: CANON_HREF, label: '81 Canon' },
    }, { headers: NO_STORE });
  } catch (err) {
    const missing = err instanceof Error && /Supabase env not configured/.test(err.message);
    return Response.json({
      error: missing ? 'The nest store is not configured.' : 'The nest could not be read.',
      code: missing ? 'not_configured' : 'store',
    }, { status: missing ? 503 : 502, headers: NO_STORE });
  }
}
