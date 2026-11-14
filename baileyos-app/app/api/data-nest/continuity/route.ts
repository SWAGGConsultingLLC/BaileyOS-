import { RECORD_CODE, runPythonJson } from '@/lib/data-nest/pythonRun';
import { listRulingBodies } from '@/lib/data-nest/rulings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const log = await listRulingBodies();
  const lights = runPythonJson(RECORD_CODE, {
    op: 'lights',
    records: log.records,
    configured: log.configured,
    error: log.error || null,
  });
  if (!lights.ok) {
    return Response.json({
      anchor_line: 'anchor not published',
      anchored_today: false,
      chain_integrity: { line: 'The ruling log could not be read.', state: 'PENDING' },
      computed_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      consensus: { consensus_count: null, line: 'The ruling log could not be read.', state: 'PENDING', total: null },
      continuity_lock: 'PENDING',
      feed_health: { line: 'The ruling log could not be read.', state: 'PENDING' },
      head_sha256: null,
      lock_line: 'PENDING — The ruling log could not be read.',
    }, { headers: { 'Cache-Control': 'no-store' } });
  }
  return Response.json(lights.data, { headers: { 'Cache-Control': 'no-store' } });
}
