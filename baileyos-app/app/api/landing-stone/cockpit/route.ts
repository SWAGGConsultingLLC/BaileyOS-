import { askConfiguredVoters } from '@/lib/data-nest/liveVoters';
import { CONVENE_CODE, RECORD_CODE, runPythonJson } from '@/lib/data-nest/pythonRun';
import { appendSequenced, latestRulingHash, listRulingBodies } from '@/lib/data-nest/rulings';
import { decideCockpitAct, compassRecord } from '@/lib/landing-stone/cockpit';
import { dissentBearings, feedMarks, LIGHTS_WIN, placeSeats } from '@/lib/landing-stone/compass';
import { loadSlotConfig, slotViews } from '@/lib/landing-stone/slots';
import { allow } from '@/lib/rateLimit';
import { isActiveSteward } from '@/lib/steward/decide';
import { readStewardGrant } from '@/lib/steward/store';
import { admin } from '@/lib/supabaseAdmin';
import { fetchSuiteUser } from '@/lib/suite/hosted';
import { decideSuiteSubject, suiteConfig } from '@/lib/suite/verify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const NO_STORE = { 'Cache-Control': 'no-store' };

function tokenOf(req: Request): string {
  return (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
}

async function stewardOf(req: Request): Promise<{ signedIn: boolean; steward: boolean; subject: string | null }> {
  const token = tokenOf(req);
  const config = suiteConfig();
  if (!token || !config) return { signedIn: false, steward: false, subject: null };
  const decision = decideSuiteSubject(token, await fetchSuiteUser(token, config));
  if (!decision.ok) return { signedIn: false, steward: false, subject: null };
  try {
    const grant = await readStewardGrant(decision.subject);
    return { signedIn: true, steward: isActiveSteward(decision.subject, grant), subject: decision.subject };
  } catch {
    return { signedIn: true, steward: false, subject: decision.subject };
  }
}

async function readActs(): Promise<{ configured: boolean; acts: { act: string; head_sha256: string | null; created_at: string }[] }> {
  try {
    const { data, error } = await admin()
      .from('steward_cockpit_acts')
      .select('act, head_sha256, created_at')
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) return { configured: false, acts: [] };
    const acts = (data || []).map((row) => ({
      act: String(row.act),
      head_sha256: typeof row.head_sha256 === 'string' ? row.head_sha256 : null,
      created_at: String(row.created_at),
    }));
    return { configured: true, acts };
  } catch {
    return { configured: false, acts: [] };
  }
}

export async function GET(req: Request) {
  const who = await stewardOf(req);
  const log = await listRulingBodies();
  const lights = runPythonJson(RECORD_CODE, {
    op: 'lights',
    records: log.records,
    configured: log.configured,
    error: log.error || null,
  });
  const latest = Array.isArray(log.records) ? log.records[log.records.length - 1] : null;
  const facts = compassRecord(latest);
  const seats = placeSeats(slotViews(loadSlotConfig().slots, process.env));
  const acts = await readActs();
  return Response.json({
    steward: who.steward,
    lights: lights.ok ? lights.data : null,
    seats,
    dissent_bearings: dissentBearings(seats, facts.dissent),
    feed_marks: feedMarks(facts.sources, facts.vetoes),
    veto_lines: facts.vetoes.map((row) => `${row.rule_id || 'veto'} · ${row.feed_id || 'feed'} · ${row.feed_status || ''}`),
    acts: acts.acts,
    acts_configured: acts.configured,
    lights_win: LIGHTS_WIN,
  }, { headers: NO_STORE });
}

function hasReport(body: Record<string, unknown>): boolean {
  return typeof body.report_canonical_json === 'string'
    && typeof body.report_sha256 === 'string'
    && typeof body.input_sha256 === 'string'
    && typeof body.input_canonical_json === 'string'
    && body.report !== null
    && typeof body.report === 'object';
}

export async function POST(req: Request) {
  const who = await stewardOf(req);
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { body = {}; }
  const head = await latestRulingHash();
  const decision = decideCockpitAct({
    signedIn: who.signedIn,
    steward: who.steward,
    act: typeof body.act === 'string' ? body.act : '',
    hasReport: hasReport(body),
    head,
  });
  if (!decision.ok) return Response.json({ error: decision.error }, { status: decision.status, headers: NO_STORE });
  if (!who.subject || !allow('cockpit:' + who.subject, 20, 10 * 60 * 1000)) {
    return Response.json({ error: 'Too many steward acts. Wait a few minutes.' }, { status: 429, headers: NO_STORE });
  }
  if (decision.act === 'convene') {
    const reportText = String(body.report_canonical_json);
    const reportSha = String(body.report_sha256);
    const inputSha = String(body.input_sha256);
    const asked = await askConfiguredVoters({ report: reportText, reportSha, inputSha, req });
    const queen = runPythonJson(CONVENE_CODE, {
      report_canonical_json: reportText,
      report_sha256: reportSha,
      input_canonical_json: body.input_canonical_json,
      ai_seats: asked.seats,
      payloads: null,
    });
    if (!queen.ok) return Response.json({ error: queen.error }, { status: 503, headers: NO_STORE });
    const sealed = {
      input_sha256: body.input_sha256,
      report_sha256: reportSha,
      input_canonical_json: body.input_canonical_json,
      report_canonical_json: reportText,
      report: body.report,
    };
    const saved = await appendSequenced(
      (prev, sequence) => {
        const built = runPythonJson(RECORD_CODE, { sealed, queen: queen.data, prev, sequence, env_flags: asked.envFlags, slot_answers: asked.answers });
        return built.ok ? { ok: true as const, data: built.data as { record_sha256?: string } } : built;
      },
      () => {
        const built = runPythonJson(RECORD_CODE, { op: 'genesis' });
        return built.ok ? { ok: true as const, data: built.data as { record_sha256?: string } } : built;
      },
    );
    return Response.json({
      act: 'convene',
      stored: saved.stored,
      error: saved.stored ? null : saved.reason || 'The ruling log did not accept the record.',
      voters_called: asked.called,
    }, { headers: NO_STORE });
  }
  try {
    const { error } = await admin().from('steward_cockpit_acts').insert({
      subject_id: who.subject,
      act: decision.act,
      head_sha256: head,
    });
    if (error) {
      const missing = /steward_cockpit_acts|schema cache|does not exist/i.test(error.message || '');
      return Response.json({
        error: missing ? 'The steward act log is not configured. Apply 20261121060000_steward_cockpit_acts.sql.' : 'The steward act was not stored.',
      }, { status: missing ? 503 : 500, headers: NO_STORE });
    }
  } catch {
    return Response.json({ error: 'The steward act log is not configured. Apply 20261121060000_steward_cockpit_acts.sql.' }, { status: 503, headers: NO_STORE });
  }
  return Response.json({ act: decision.act, stored: true, head_sha256: head }, { headers: NO_STORE });
}
