import { clientIp, handleOracle } from '@/lib/oracle';
import { memberId } from '@/lib/data-nest/member';
import { runPython } from '@/lib/data-nest/pythonRun';
import { allow } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const SYSTEM = 'You review a BaileyOS corridor validator report. Reply with JSON only: {"verdict":"agree"|"disagree"|"uncertain","reason":"one or two sentences"}. agree means the report is a faithful result of its checks, even when the overall result is FAIL or WARN. Do not invent road conditions, alerts, or a precise location. If you cannot tell, use uncertain.';

function chunks(text: string, size: number): string[] {
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += size) parts.push(text.slice(i, i + size));
  return parts;
}

export async function POST(req: Request) {
  const member = await memberId(req);
  if (!member.ok) return member.response;
  const day = new Date().toISOString().slice(0, 10);
  if (!allow(`nest-gemini:${member.id}:${day}`, 8, 36 * 60 * 60 * 1000)) {
    return Response.json({ error: 'Daily Gemini review limit reached. Try again tomorrow.', code: 'rate_limit' }, { status: 429 });
  }
  let body: { report_canonical_json?: unknown; report_sha256?: unknown; input_sha256?: unknown; conditions?: unknown };
  try { body = await req.json(); } catch { return Response.json({ error: 'JSON required.', code: 'bad_request' }, { status: 400 }); }
  const report = typeof body.report_canonical_json === 'string' ? body.report_canonical_json : '';
  const reportSha = typeof body.report_sha256 === 'string' ? body.report_sha256 : '';
  const inputSha = typeof body.input_sha256 === 'string' ? body.input_sha256 : '';
  if (!report || !reportSha) return Response.json({ error: 'Run validation first.', code: 'bad_request' }, { status: 400 });
  const conditions = typeof body.conditions === 'string' ? body.conditions.slice(0, 1200) : '';
  const parts = chunks(report, 3200).slice(0, 4);
  const messages = parts.map((part, index) => ({ role: 'user' as const, content: `Report part ${index + 1} of ${parts.length}, sha256 ${reportSha}.\n${part}` }));
  messages.push({
    role: 'user',
    content: `Input sha256 ${inputSha}. Local conditions (coarsened, no precise fix): ${conditions || 'none supplied'}. Reply with the JSON verdict only.`,
  });
  const upstream = await handleOracle(new Request('https://baileyos-app.vercel.app/api/oracle', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': clientIp(req) },
    body: JSON.stringify({ provider: 'gemini', model: 'gemini-3.8-flash', system: SYSTEM, messages }),
  }));
  const payload = await upstream.json().catch(() => ({})) as { reply?: string; error?: string; code?: string; model?: string };
  const acted_at = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  if (upstream.status === 502 || upstream.status === 503) {
    return Response.json({
      unavailable: true,
      message: 'Gemini unavailable, try again',
      acted_at,
      report_sha256: reportSha,
      vote: { unavailable: true, reason: 'Gemini unavailable', reviewed_report_sha256: reportSha, reviewed_input_sha256: inputSha },
    }, { status: 200 });
  }
  if (!upstream.ok) {
    return Response.json({ error: payload.error || 'Gemini did not answer.', code: payload.code || 'upstream', acted_at, report_sha256: reportSha }, { status: upstream.status });
  }
  const reply = payload.reply || '';
  const parsed = runPython('import json,sys\nfrom _consensus import parse_reviewer_reply\njson.dump(parse_reviewer_reply(sys.stdin.read()), sys.stdout)\n', reply);
  const verdict = parsed.ok ? JSON.parse(parsed.stdout) as { verdict: string; reason: string } : { verdict: 'uncertain', reason: 'reply was not checked' };
  return Response.json({
    unavailable: false,
    message: null,
    acted_at,
    report_sha256: reportSha,
    model: payload.model || 'gemini-3.8-flash',
    vote: {
      raw_reply: reply,
      verdict: verdict.verdict,
      reason: verdict.reason,
      reviewed_report_sha256: reportSha,
      reviewed_input_sha256: inputSha,
      model: 'gemini-3.8-flash',
      reviewed_at: acted_at,
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
