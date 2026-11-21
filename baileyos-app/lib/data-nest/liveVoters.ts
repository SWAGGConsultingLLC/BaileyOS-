import { clientIp, handleOracle } from '@/lib/oracle';
import { runPython } from '@/lib/data-nest/pythonRun';
import { loadSlotConfig, type SlotConfig } from '@/lib/landing-stone/slots';

const SYSTEM = 'You review a BaileyOS live-feed report. Reply with JSON only: {"verdict":"agree"|"disagree"|"uncertain","reason":"one or two sentences"}. agree means the report is a faithful result of its checks, even when the overall result is FAIL or WARN. Do not invent alerts, road conditions, or a precise location. If you cannot tell, use uncertain.';

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

export async function askConfiguredVoters(input: {
  report: string;
  reportSha: string;
  inputSha: string;
  req: Request;
}): Promise<{ gemini: unknown; answers: Record<string, string>; envFlags: Record<string, boolean>; called: string[] }> {
  const slots = registrySlots();
  const calls = votersToCall(slots, process.env);
  const flags = envFlags(slots, process.env);
  const answers: Record<string, string> = {};
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
          content: `Report sha256 ${input.reportSha}. Input sha256 ${input.inputSha}.\n${brief}\nReply with the JSON verdict only.`,
        }],
      }),
    }));
    const payload = await upstream.json().catch(() => ({})) as { reply?: string };
    const acted = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    if (!upstream.ok || !payload.reply) {
      if (call.id === 'B') {
        gemini = { unavailable: true, reason: `${call.name} did not answer`, reviewed_report_sha256: input.reportSha, reviewed_input_sha256: input.inputSha };
      }
      return;
    }
    answers[call.id] = payload.reply;
    if (call.id === 'B') {
      const parsed = runPython('import json,sys\nfrom _consensus import parse_reviewer_reply\njson.dump(parse_reviewer_reply(sys.stdin.read()), sys.stdout)\n', payload.reply);
      const verdict = parsed.ok ? JSON.parse(parsed.stdout) as { verdict: string; reason: string } : { verdict: 'uncertain', reason: 'reply was not checked' };
      gemini = {
        raw_reply: payload.reply,
        verdict: verdict.verdict,
        reason: verdict.reason,
        reviewed_report_sha256: input.reportSha,
        reviewed_input_sha256: input.inputSha,
        model: call.model,
        reviewed_at: acted,
      };
    }
  }));
  return { gemini, answers, envFlags: flags, called: calls.map((call) => call.id) };
}
