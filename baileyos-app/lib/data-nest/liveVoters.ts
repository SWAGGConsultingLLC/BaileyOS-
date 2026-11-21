import { clientIp, handleOracle } from '@/lib/oracle';
import { runPython } from '@/lib/data-nest/pythonRun';
import { loadSlotConfig, type SlotConfig } from '@/lib/landing-stone/slots';

const SYSTEM = 'You review a BaileyOS live-feed report. Reply with JSON only: {"outcome":"approved"|"denied"|"abstained"|"deferred","reason":"one or two sentences"}. approved means the report is a faithful result of its checks, even when the overall result is FAIL or WARN. denied means it is not. abstained means you will not take a side. deferred means you cannot tell yet. Do not invent alerts, road conditions, or a precise location.';

export type LiveCall = {
  id: string;
  name: string;
  tier: 'free' | 'paid';
  provider: 'grok' | 'gemini' | 'github';
  model: string;
};

const CALLABLE = new Set(['grok', 'gemini', 'github']);

export function votersToCall(slots: SlotConfig[], env: Record<string, string | undefined>): LiveCall[] {
  const ordered = [...slots.filter((slot) => slot.tier === 'free'), ...slots.filter((slot) => slot.tier === 'paid')];
  const calls: LiveCall[] = [];
  for (const slot of ordered) {
    if (slot.enabled !== true) continue;
    const secret = slot.env ? (env[slot.env] || '').trim() : '';
    if (!slot.env || !secret) continue;
    if (!slot.oracle || !CALLABLE.has(slot.oracle)) continue;
    if (!slot.model) continue;
    calls.push({
      id: slot.id,
      name: slot.name,
      tier: slot.tier,
      provider: slot.oracle as LiveCall['provider'],
      model: slot.model,
    });
  }
  return calls;
}

export function envFlags(slots: SlotConfig[], env: Record<string, string | undefined>): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  for (const slot of slots) {
    if (!slot.env) continue;
    flags[slot.env] = Boolean((env[slot.env] || '').trim());
  }
  return flags;
}

export function registrySlots(): SlotConfig[] {
  return loadSlotConfig().slots;
}

export type AiSeat = { reviewer: string; configured: true; vote: unknown };

function reviewerSlug(name: string): string {
  const first = name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ')[0];
  return first || 'seat';
}

export async function askConfiguredVoters(input: {
  report: string;
  reportSha: string;
  inputSha: string;
  req: Request;
}): Promise<{ gemini: unknown; answers: Record<string, string>; envFlags: Record<string, boolean>; called: string[]; seats: AiSeat[] }> {
  const slots = registrySlots();
  const calls = votersToCall(slots, process.env);
  const flags = envFlags(slots, process.env);
  const answers: Record<string, string> = {};
  const seats: AiSeat[] = [];
  let gemini: unknown = null;
  const brief = input.report.slice(0, 3500);
  await Promise.all(calls.map(async (call) => {
    const upstream = await handleOracle(new Request('https://baileyos-app.vercel.app/api/oracle', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': clientIp(input.req) },
      body: JSON.stringify({
        provider: call.provider,
        model: call.model,
        system: SYSTEM,
        messages: [{
          role: 'user',
          content: `Report sha256 ${input.reportSha}. Input sha256 ${input.inputSha}.\n${brief}\nReply with the JSON outcome only.`,
        }],
      }),
    }));
    const payload = await upstream.json().catch(() => ({})) as { reply?: string };
    const acted = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const reviewer = reviewerSlug(call.name);
    if (!upstream.ok || !payload.reply) {
      const missed = { unavailable: true, reason: `${call.name} did not answer`, reviewed_report_sha256: input.reportSha, reviewed_input_sha256: input.inputSha };
      seats.push({ reviewer, configured: true, vote: missed });
      if (call.id === 'B') gemini = missed;
      return;
    }
    answers[call.id] = payload.reply;
    const parsed = runPython('import json,sys\nfrom _consensus import parse_reviewer_reply\njson.dump(parse_reviewer_reply(sys.stdin.read()), sys.stdout)\n', payload.reply);
    const verdict = parsed.ok ? JSON.parse(parsed.stdout) as { verdict?: string; outcome?: string; reason: string } : { verdict: 'uncertain', outcome: 'abstained', reason: 'reply was not checked' };
    const vote = {
      raw_reply: payload.reply,
      verdict: verdict.verdict,
      outcome: verdict.outcome,
      reason: verdict.reason,
      reviewed_report_sha256: input.reportSha,
      reviewed_input_sha256: input.inputSha,
      model: call.model,
      reviewed_at: acted,
    };
    seats.push({ reviewer, configured: true, vote });
    if (call.id === 'B') gemini = vote;
  }));
  seats.sort((a, b) => a.reviewer.localeCompare(b.reviewer));
  return { gemini, answers, envFlags: flags, called: calls.map((call) => call.id), seats };
}
