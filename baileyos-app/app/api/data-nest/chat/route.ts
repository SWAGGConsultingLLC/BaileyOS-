import { clientIp, handleOracle } from '@/lib/oracle';
import { memberId } from '@/lib/data-nest/member';
import { allow } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const SYSTEM = 'You are the Data Nest guide for a signed-in person near Grand Junction and I-70. Use only the briefing and the conversation. The briefing is coarsened public data already on their screen. Say when you do not know. Do not invent alerts, closures, counts, or a precise location. Do not give driving instructions that contradict an official alert. If a feed is missing or stale, say so.';

function scrub(text: string): string {
  return text.replace(/-?\d{1,3}\.\d{3,}/g, (match) => {
    const value = Number(match);
    if (!Number.isFinite(value) || Math.abs(value) > 180) return match;
    return (Math.round(value * 100) / 100).toFixed(2);
  });
}

export async function POST(req: Request) {
  const member = await memberId(req);
  if (!member.ok) return member.response;
  const day = new Date().toISOString().slice(0, 10);
  if (!allow(`nest-chat:${member.id}:${day}`, 20, 36 * 60 * 60 * 1000)) {
    return Response.json({ error: 'Daily Gemini chat limit reached. Try again tomorrow.', code: 'rate_limit' }, { status: 429 });
  }
  let body: { messages?: unknown; briefing?: unknown };
  try { body = await req.json(); } catch { return Response.json({ error: 'JSON required.', code: 'bad_request' }, { status: 400 }); }
  const incoming = Array.isArray(body.messages) ? body.messages : [];
  const messages = incoming.slice(-4).map((item) => {
    const row = item as { role?: unknown; content?: unknown };
    const role = row.role === 'assistant' ? 'assistant' as const : 'user' as const;
    const content = scrub(typeof row.content === 'string' ? row.content : '').slice(0, 800);
    return { role, content };
  }).filter((item) => item.content.trim());
  const briefing = scrub(typeof body.briefing === 'string' ? body.briefing : '').slice(0, 2000);
  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return Response.json({ error: 'Send a message.', code: 'bad_request' }, { status: 400 });
  }
  messages.unshift({ role: 'user', content: `Briefing from the screen:\n${briefing || 'No live briefing yet.'}` });
  const upstream = await handleOracle(new Request('https://baileyos-app.vercel.app/api/oracle', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': clientIp(req) },
    body: JSON.stringify({ provider: 'gemini', model: 'gemini-3.8-flash', system: SYSTEM, messages }),
  }));
  const payload = await upstream.json().catch(() => ({})) as { reply?: string; error?: string; code?: string };
  if (upstream.status === 502 || upstream.status === 503) {
    return Response.json({ error: 'Gemini unavailable, try again', code: 'unavailable' }, { status: 200 });
  }
  if (!upstream.ok) return Response.json({ error: payload.error || 'Gemini did not answer.', code: payload.code || 'upstream' }, { status: upstream.status });
  return Response.json({ reply: payload.reply || '', provider: 'gemini', model: 'gemini-3.8-flash' }, { headers: { 'Cache-Control': 'no-store' } });
}
