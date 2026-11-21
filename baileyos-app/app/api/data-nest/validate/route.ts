import { memberId } from '@/lib/data-nest/member';
import { loadLive } from '@/lib/data-nest/liveFeeds';
import { isCoarsened } from '@/lib/data-nest/geo';
import { SEAL_CODE, runPythonJson } from '@/lib/data-nest/pythonRun';
import { allow } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: Request) {
  const member = await memberId(req);
  if (!member.ok) return member.response;
  if (!allow('nest-validate:' + member.id, 20, 10 * 60 * 1000)) {
    return Response.json({ error: 'Too many validation runs. Wait a few minutes.', code: 'rate_limit' }, { status: 429 });
  }
  let body: { lat?: unknown; lon?: unknown; radiusKm?: unknown };
  try { body = await req.json(); } catch { body = {}; }
  const lat = Number(body.lat);
  const lon = Number(body.lon);
  const radiusKm = Number(body.radiusKm ?? 80);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !isCoarsened(lat, lon)) {
    return Response.json({ error: 'Send a coarsened area (2 decimal degrees).', code: 'bad_request' }, { status: 400 });
  }
  const live = await loadLive(lat, lon, Number.isFinite(radiusKm) ? radiusKm : 80);
  const sealed = runPythonJson(SEAL_CODE, {
    cell: live.cell,
    freshness: live.freshness,
    payloads: live.rawPayloads,
    code_sha: process.env.VERCEL_GIT_COMMIT_SHA || null,
  });
  if (!sealed.ok) {
    return Response.json({ error: sealed.error, code: 'python_unavailable' }, { status: 503 });
  }
  return Response.json({
    runtime: 'cpython',
    acted_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    cell: live.cell,
    needsSetup: live.needsSetup,
    items: live.items,
    freshness: live.freshness,
    package: sealed.data,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
