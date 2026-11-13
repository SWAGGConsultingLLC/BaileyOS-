/**
 * Landing Stone agent drill.
 * Edit SIM_CONFIG. On load the page copies these defaults into the Rules panel.
 * The referee reads the panel, so the numbers and words on screen are the ones it enforces.
 * Slot C is optional. The cycle is A, then B, then C only when Slot C is included.
 *
 * Model defaults checked 2026-11-13:
 * - Slot A Grok: grok-4.7 via https://api.x.ai/v1/chat/completions
 *   https://docs.x.ai/developers/models
 * - Slot B Gemini: gemini-3.8-flash via Generative Language generateContent
 *   (the same call shape as signal-ark/index.html).
 *   https://ai.google.dev/gemini-api/docs/deprecations
 * - Slot C GitHub Models: openai/gpt-4o-mini via
 *   https://models.github.ai/inference/chat/completions
 *   That id is the model in GitHub’s own inference sample and was on the free
 *   rate-limited tier. GitHub retired the Models catalog and inference API on
 *   July 30, 2026 (https://docs.github.com/en/github-models), so a live call
 *   is expected to fail. The model field stays editable. Demo mode still
 *   takes the turn.
 */

export const PROXY_BASE = "https://baileyos-app.vercel.app";

export const SIM_CONFIG = {
    scenario:
    "Operation Red Robin continuity lock. The Landing Stone readout is LOCKED. The included oracles propose the next heading while the lock stays closed.",
  objective:
    "Agree one shared heading for Landing Stone continuity and name one risk before the round limit.",
  maxRounds: 3,
  maxRoundsCeiling: 20,
  limits: {
    maxWords: 80,
    maxChars: 1200,
  },
  requiredLabels: ["HEADING", "RISK"],
  objectiveWords: ["continuity", "landing", "shared"],
  firstTurnPhrase: "opening turn",
  rules: [
    {
      id: "turn-order",
      text: "Strict order: Slot A, then Slot B, then Slot C when Slot C is included. A round is one turn from each included slot. The engine never skips an included slot.",
    },
    {
      id: "word-limit",
      text: "Each turn stays within the word limit. A leading demo banner line is not counted.",
    },
    {
      id: "char-limit",
      text: "Each turn stays within the character limit. A leading demo banner line is not counted.",
    },
    {
      id: "structure",
      text: "Each turn contains a HEADING: line and a RISK: line.",
    },
    {
      id: "objective",
      text: "Each turn includes at least one objective word: continuity, landing, or shared.",
    },
    {
      id: "shared-log",
      text: "The first turn says “opening turn”. Every later turn cites the previous speaker by name, so both slots are using the same log.",
    },
    {
      id: "no-secrets",
      text: "A turn must not contain an API key, a bearer token, or the phrases “password” or “secret key”.",
    },
    {
      id: "civility",
      text: "Disagreement stays on the heading. A turn must not insult the other slot.",
    },
  ],
  agents: {
    A: {
      slot: "A",
      name: "Grok",
      provider: "xai",
      providerLabel: "xAI",
      model: "grok-4.7",
      endpoint: "https://api.x.ai/v1/chat/completions",
      role: "You are Grok, Slot A in the Landing Stone drill for Operation Red Robin. You speak first in every round. Follow the rules in the user message. Write plain text with a HEADING: line and a RISK: line. On the first turn of the drill, say “opening turn”. After that, cite the previous speaker by name. Stay inside the word and character limits. Do not invent keys or secrets.",
    },
    B: {
      slot: "B",
      name: "Gemini",
      provider: "gemini",
      providerLabel: "Google",
      model: "gemini-3.8-flash",
      endpoint: "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
      role: "You are Gemini, Slot B in the Landing Stone drill for Operation Red Robin. You speak second in every round, after Slot A. Follow the rules in the user message. Write plain text with a HEADING: line and a RISK: line. Cite the previous speaker by name. Stay inside the word and character limits. Do not invent keys or secrets.",
    },
    C: {
      slot: "C",
      name: "GitHub Models",
      provider: "github",
      providerLabel: "GitHub",
      model: "openai/gpt-4o-mini",
      endpoint: "https://models.github.ai/inference/chat/completions",
      optional: true,
      role: "You are GitHub Models, Slot C in the Landing Stone drill for Operation Red Robin. You speak after Slot B when this slot is included. Follow the rules in the user message. Write plain text with a HEADING: line and a RISK: line. Cite the previous speaker by name. Stay inside the word and character limits. Do not invent tokens or secrets.",
    },
  },
};

export const DEMO_BANNER = "[DEMO PLACEHOLDER · NOT A LIVE MODEL]";

/**
 * Round 2 Slot A is past the default 80-word limit on purpose.
 * A full demo run then shows a referee flag. The other lines are written to pass.
 */
const DEMO_WORD_OVERFLOW = new Array(60).fill("pad").join(" ");

export const DEMO_LINES = {
  "1:A": [
    "opening turn",
    "HEADING: Hold a shared heading of ADAPTIVE while the Landing Stone lock stays closed.",
    "RISK: Reading the lock as a finished continuity check would hide a channel that only looks stable.",
  ].join("\n"),
  "1:B": [
    "{previous} set the first heading.",
    "HEADING: Keep the shared heading ADAPTIVE and add one continuity check on topology.",
    "RISK: Landing Stone can look locked while a side channel is still unnamed.",
  ].join("\n"),
  "2:A": [
    "{previous} is on the log.",
    "HEADING: Keep a shared heading for Landing Stone continuity.",
    "RISK: This placeholder crosses the word limit on purpose.",
    DEMO_WORD_OVERFLOW,
  ].join("\n"),
  "2:B": [
    "{previous} crossed the word limit.",
    "HEADING: Return the shared heading to ADAPTIVE for Landing Stone continuity.",
    "RISK: A long turn can bury the one risk the objective asked for.",
  ].join("\n"),
  "3:A": [
    "{previous} returned the heading to ADAPTIVE.",
    "HEADING: Final shared heading is ADAPTIVE, and the Landing Stone lock stays held.",
    "RISK: Ending early would leave continuity as a label.",
  ].join("\n"),
  "3:B": [
    "{previous} closed on ADAPTIVE.",
    "HEADING: Agree the shared heading ADAPTIVE for Landing Stone continuity.",
    "RISK: The transcript is a drill record, and the lock readout on the status page is unchanged.",
  ].join("\n"),
  "1:C": [
    "{previous} named a side channel.",
    "HEADING: Add a third check to the shared heading for Landing Stone continuity.",
    "RISK: A third voice can widen the lock if it is not on the same log.",
  ].join("\n"),
  "2:C": [
    "{previous} sent the heading back toward ADAPTIVE.",
    "HEADING: Keep the shared heading ADAPTIVE and record Landing Stone continuity.",
    "RISK: Ignoring the flagged word limit would hide how the referee works.",
  ].join("\n"),
  "3:C": [
    "{previous} agreed the heading.",
    "HEADING: Close on the shared heading ADAPTIVE for Landing Stone continuity.",
    "RISK: This optional slot still belongs on the same continuity log.",
  ].join("\n"),
};

const INSULT_RE = /\b(idiot|stupid|dumb|moron|fool|loser)\b/i;
const SECRET_RE = /AIza[0-9A-Za-z\-_]{10,}|\bsk-[A-Za-z0-9]{8,}|\bxai-[A-Za-z0-9]{8,}|\bgithub_pat_[A-Za-z0-9_]{8,}|\bghp_[A-Za-z0-9]{8,}|\bbearer\s+[A-Za-z0-9._\-]{8,}|\bpassword\b|\bsecret key\b/i;

export function scrub(text, secret) {
  const raw = String(text ?? "");
  if (!secret) return raw;
  return raw.split(secret).join("[redacted]");
}

export function stripFence(text) {
  const trimmed = String(text ?? "").trim();
  const match = trimmed.match(/^```[a-z0-9]*\n([\s\S]*?)\n```$/i);
  return match ? match[1].trim() : trimmed;
}

export function measurableText(text) {
  const cleaned = stripFence(text);
  const lines = cleaned.split(/\n/);
  if (lines[0] && lines[0].trim() === DEMO_BANNER) {
    return lines.slice(1).join("\n").trim();
  }
  return cleaned.trim();
}

export function wordCount(text) {
  const body = measurableText(text);
  if (!body) return 0;
  return body.split(/\s+/).filter(Boolean).length;
}

function mentions(haystack, word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("(?<![\\p{L}\\p{N}])" + escaped + "(?![\\p{L}\\p{N}])", "iu").test(haystack);
}

export function clampNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function readSession(config, fields) {
  const objectiveWords = String(fields.objectiveWords ?? config.objectiveWords.join(", "))
    .split(",")
    .map((word) => word.trim())
    .filter(Boolean);
  const nameA = String(fields.nameA ?? config.agents.A.name).trim() || "Slot A";
  const nameB = String(fields.nameB ?? config.agents.B.name).trim() || "Slot B";
  const nameC = String(fields.nameC ?? config.agents.C.name).trim() || "Slot C";
  const modelA = String(fields.modelA ?? config.agents.A.model).trim() || config.agents.A.model;
  const modelB = String(fields.modelB ?? config.agents.B.model).trim() || config.agents.B.model;
  const modelC = String(fields.modelC ?? config.agents.C.model).trim() || config.agents.C.model;
  return {
    scenario: String(fields.scenario ?? config.scenario).trim(),
    objective: String(fields.objective ?? config.objective).trim(),
    maxRounds: clampNumber(fields.maxRounds, config.maxRounds, 1, config.maxRoundsCeiling),
    maxWords: clampNumber(fields.maxWords, config.limits.maxWords, 1, 2000),
    maxChars: clampNumber(fields.maxChars, config.limits.maxChars, 1, 20000),
    requiredLabels: config.requiredLabels.slice(),
    objectiveWords,
    firstTurnPhrase: config.firstTurnPhrase,
    rules: config.rules,
    mode: fields.mode === "demo" ? "demo" : "live",
    slotC: fields.slotC === true,
    agents: {
      A: {
        ...config.agents.A,
        name: nameA,
        model: modelA,
        role: String(fields.roleA ?? config.agents.A.role),
      },
      B: {
        ...config.agents.B,
        name: nameB,
        model: modelB,
        role: String(fields.roleB ?? config.agents.B.role),
      },
      C: {
        ...config.agents.C,
        name: nameC,
        model: modelC,
        role: String(fields.roleC ?? config.agents.C.role),
      },
    },
  };
}

export function activeSlots(session) {
  return session.slotC ? ["A", "B", "C"] : ["A", "B"];
}

export function advanceCursor(cursor, session) {
  const slots = activeSlots(session);
  const index = slots.indexOf(cursor.slot);
  if (index === -1) {
    if (cursor.round >= session.maxRounds) {
      return { cursor: { round: cursor.round, slot: slots[slots.length - 1] }, done: true };
    }
    return { cursor: { round: cursor.round + 1, slot: slots[0] }, done: false };
  }
  if (index < slots.length - 1) {
    return { cursor: { round: cursor.round, slot: slots[index + 1] }, done: false };
  }
  if (cursor.round >= session.maxRounds) return { cursor, done: true };
  return { cursor: { round: cursor.round + 1, slot: slots[0] }, done: false };
}

export function orderPhrase(session) {
  return activeSlots(session)
    .map((slot) => `Slot ${slot} ${session.agents[slot].name}`)
    .join(", then ");
}

export function describeRule(rule, session) {
  switch (rule.id) {
    case "word-limit":
      return `Each turn stays within ${session.maxWords} words. A leading line that is exactly the demo banner is not counted.`;
    case "char-limit":
      return `Each turn stays within ${session.maxChars} characters. A leading demo banner line is not counted.`;
    case "structure":
      return `Each turn contains ${session.requiredLabels.map((label) => label + ":").join(" and ")} on their own lines.`;
    case "objective":
      return session.objectiveWords.length
        ? `Each turn includes at least one objective word: ${session.objectiveWords.join(", ")}.`
        : "No objective words are set, so the objective check is skipped.";
    case "turn-order": {
      const slots = activeSlots(session);
      const names = slots.map((slot) => `Slot ${slot} (${session.agents[slot].name})`).join(", then ");
      return `Strict order: ${names}. A round is one turn from each included slot. The engine never skips an included slot. Slot C is in the cycle only when it is included.`;
    }
    default:
      return rule.text;
  }
}

export function refereeTurn({ text, slot, expectedSlot, previousSpeaker, session }) {
  const violations = [];
  const body = measurableText(text);
  const words = wordCount(text);
  const chars = body.length;

  if (slot !== expectedSlot) {
    violations.push({
      ruleId: "turn-order",
      detail: `Expected Slot ${expectedSlot}, received Slot ${slot}.`,
    });
  }
  if (words > session.maxWords) {
    violations.push({
      ruleId: "word-limit",
      detail: `${words} words exceeds the limit of ${session.maxWords}.`,
    });
  }
  if (chars > session.maxChars) {
    violations.push({
      ruleId: "char-limit",
      detail: `${chars} characters exceeds the limit of ${session.maxChars}.`,
    });
  }
  for (const label of session.requiredLabels) {
    const pattern = new RegExp("^" + label + "\\s*:", "im");
    if (!pattern.test(body)) {
      violations.push({
        ruleId: "structure",
        detail: `Missing ${label}: line.`,
      });
    }
  }
  if (session.objectiveWords.length) {
    const hit = session.objectiveWords.some((word) => mentions(body, word));
    if (!hit) {
      violations.push({
        ruleId: "objective",
        detail: `None of the objective words appeared: ${session.objectiveWords.join(", ")}.`,
      });
    }
  }
  if (!previousSpeaker) {
    if (!body.toLowerCase().includes(String(session.firstTurnPhrase).toLowerCase())) {
      violations.push({
        ruleId: "shared-log",
        detail: `The first turn must include “${session.firstTurnPhrase}”.`,
      });
    }
  } else if (!mentions(body, previousSpeaker)) {
    violations.push({
      ruleId: "shared-log",
      detail: `Cite the previous speaker “${previousSpeaker}” so both slots share one log.`,
    });
  }
  if (SECRET_RE.test(body)) {
    violations.push({
      ruleId: "no-secrets",
      detail: "The turn appears to contain a key, token, or secret phrase.",
    });
  }
  if (INSULT_RE.test(body)) {
    violations.push({
      ruleId: "civility",
      detail: "The turn insults the other slot.",
    });
  }
  return { pass: violations.length === 0, violations, words, chars };
}

export function buildSharedState(session, transcript, cursor) {
  return {
    scenario: session.scenario,
    objective: session.objective,
    round: cursor.round,
    maxRounds: session.maxRounds,
    nextSlot: cursor.slot,
    limits: { maxWords: session.maxWords, maxChars: session.maxChars },
    objectiveWords: session.objectiveWords,
    requiredLabels: session.requiredLabels,
    rules: session.rules.map((rule) => ({ id: rule.id, text: describeRule(rule, session) })),
    transcript: transcript.map((entry) => ({
      round: entry.round,
      slot: entry.slot,
      name: entry.name,
      source: entry.source,
      text: entry.text,
      referee: entry.referee.pass ? "pass" : "flag",
      violations: entry.referee.violations,
    })),
  };
}

export function buildUserPrompt(session, transcript, cursor) {
  const previous = transcript[transcript.length - 1] || null;
  const agent = session.agents[cursor.slot];
  const lines = [
    `You are Slot ${cursor.slot} (${agent.name}). It is round ${cursor.round} of ${session.maxRounds}.`,
    previous
      ? `The previous speaker was ${previous.name}. Cite that exact name in your turn.`
      : `This is the first turn. Include the phrase "${session.firstTurnPhrase}".`,
    `Write at most ${session.maxWords} words and ${session.maxChars} characters.`,
    `Include these labels on their own lines: ${session.requiredLabels.map((label) => label + ":").join(" ")}.`,
    session.objectiveWords.length
      ? `Include at least one of these objective words: ${session.objectiveWords.join(", ")}.`
      : "No objective words are set for this session.",
    "Do not include keys, tokens, passwords, or insults.",
    "",
    "SHARED STATE",
    JSON.stringify(buildSharedState(session, transcript, cursor), null, 2),
  ];
  return lines.join("\n");
}

export function adjudicate({ session, transcript, cursor, text, source }) {
  const previous = transcript[transcript.length - 1] || null;
  const agent = session.agents[cursor.slot];
  const clean = stripFence(text);
  const referee = refereeTurn({
    text: clean,
    slot: cursor.slot,
    expectedSlot: cursor.slot,
    previousSpeaker: previous ? previous.name : "",
    session,
  });
  const entry = {
    round: cursor.round,
    slot: cursor.slot,
    name: agent.name,
    model: agent.model,
    provider: agent.provider,
    source,
    text: clean,
    referee,
  };
  const nextTranscript = transcript.concat(entry);
  const moved = advanceCursor(cursor, session);
  return { entry, transcript: nextTranscript, cursor: moved.cursor, done: moved.done };
}

export function demoTurnText({ round, slot, previousName }) {
  const template = DEMO_LINES[`${round}:${slot}`];
  let body;
  if (!template) {
    const cite = previousName ? `${previousName} is on the shared log.` : "opening turn";
    body = [
      cite,
      "HEADING: Hold the shared heading for Landing Stone.",
      "RISK: This extra round is still a continuity drill.",
    ].join("\n");
  } else {
    body = previousName ? template.replaceAll("{previous}", previousName) : template;
  }
  return `${DEMO_BANNER}\n${body}`;
}

export async function playDrill(session, produce) {
  let cursor = { round: 1, slot: "A" };
  let transcript = [];
  let done = false;
  let guard = 0;
  while (!done) {
    const previous = transcript[transcript.length - 1] || null;
    const text = await produce({
      session,
      transcript,
      cursor,
      previousName: previous ? previous.name : "",
    });
    const result = adjudicate({
      session,
      transcript,
      cursor,
      text,
      source: session.mode,
    });
    transcript = result.transcript;
    cursor = result.cursor;
    done = result.done;
    guard += 1;
    if (guard > session.maxRounds * activeSlots(session).length + 2) {
      throw new Error("The drill did not reach the round limit.");
    }
  }
  return transcript;
}

export function xaiRequest({ key, model, system, prompt }) {
  return {
    url: SIM_CONFIG.agents.A.endpoint,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        max_tokens: 300,
        stream: false,
      }),
    },
  };
}

export function githubRequest({ key, model, system, prompt }) {
  return {
    url: SIM_CONFIG.agents.C.endpoint,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${key}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        max_tokens: 300,
        stream: false,
      }),
    },
  };
}

export function geminiModelId(model) {
  return String(model || SIM_CONFIG.agents.B.model).trim().replace(/^models\//, "");
}

export function geminiRequest({ key, model, system, prompt }) {
  const id = geminiModelId(model);
  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(id)}:generateContent`,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 300 },
      }),
    },
  };
}

export class ProviderFailure extends Error {
  constructor(slot, info) {
    super(info.message);
    this.name = "ProviderFailure";
    this.slot = slot;
    this.code = info.code;
    this.title = info.title;
    this.info = info;
  }
}

function providerMessage(json, raw) {
  if (json && typeof json.error === "string") return json.error;
  if (json && json.error && typeof json.error.message === "string") return json.error.message;
  if (json && typeof json.message === "string") return json.message;
  return String(raw || "").slice(0, 240);
}

function xaiText(json) {
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part === "string" ? part : part?.text || "")).join("");
  }
  return "";
}

function geminiText(json) {
  const parts = json?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((part) => part?.text || "").join("");
}

export function failureFromStatus(agent, status, raw, json, key) {
  const detail = scrub(providerMessage(json, raw), key).replace(/\s+/g, " ").trim();
  const tail = detail ? ` Provider said: ${detail}` : "";
  if (status === 401 || status === 403) {
    const scope = agent.provider === "github" ? " The token needs the models:read permission." : "";
    const retired = agent.provider === "github" ? " GitHub retired the Models inference API on July 30, 2026." : "";
    return {
      code: "auth",
      title: "Key rejected",
      message: `${agent.providerLabel} rejected the key for ${agent.name} (HTTP ${status}).${scope} Check it and try Step again, or run Demo mode.${retired}${tail}`,
    };
  }
  if (status === 410 && agent.provider === "github") {
    return {
      code: "retired",
      title: "GitHub Models retired",
      message: `GitHub retired the Models inference API on July 30, 2026 (HTTP 410). Slot C stays in the turn order. Run Demo mode for a placeholder turn.${tail}`,
    };
  }
  if (status === 429) {
    const info = rateLimitInfo(agent, "", "direct");
    info.message += tail;
    return info;
  }
  if (status === 404) {
    return {
      code: "model",
      title: "Model not found",
      message: `${agent.providerLabel} could not find model “${agent.model}” (HTTP 404). Edit the model field. The default for this slot is ${SIM_CONFIG.agents[agent.slot].model}.${tail}${agent.provider === "github" ? " GitHub retired the Models catalog and inference API on July 30, 2026." : ""}`,
    };
  }
  return {
    code: "http",
    title: "Call failed",
    message: `${agent.providerLabel} returned HTTP ${status} for ${agent.name}. Run Demo mode to keep the turn order and the referee.${tail}`,
  };
}

export function rateLimitInfo(agent, retryAfter, via) {
  const wait = retryAfter ? ` The response asked for a wait of ${retryAfter}.` : "";
  const where = via === "proxy" ? "The BaileyOS oracle proxy" : agent.providerLabel;
  return {
    code: "rate-limit",
    title: "Rate limit",
    message: `${where} rate-limited ${agent.name} (HTTP 429). This run is paused.${wait} Wait, then press Step or Start to try this slot again. Demo mode can finish the drill without another call.`,
  };
}

export function proxyUrl() {
  return String(PROXY_BASE).replace(/\/$/, "") + "/api/oracle";
}

export function proxyProviderId(agent) {
  if (agent.provider === "gemini") return "gemini";
  if (agent.provider === "github") return "github";
  return "grok";
}

export function proxyRequest({ provider, model, system, messages }) {
  return {
    url: proxyUrl(),
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        provider,
        model,
        system,
        messages,
      }),
    },
  };
}

export function proxyReplyText(json, raw) {
  if (typeof json === "string") return json.trim();
  if (json && typeof json === "object") {
    for (const key of ["text", "reply", "content"]) {
      if (typeof json[key] === "string" && json[key].trim()) return json[key].trim();
    }
    if (typeof json.message === "string" && json.message.trim() && !json.message.startsWith("{")) {
      return json.message.trim();
    }
    const chat = xaiText(json);
    if (chat.trim()) return chat.trim();
    const gemini = geminiText(json);
    if (gemini.trim()) return gemini.trim();
  }
  const plain = String(raw || "").trim();
  if (plain && !plain.startsWith("{") && !plain.startsWith("<") && !plain.startsWith("[")) return plain;
  return "";
}

function headerValue(response, name) {
  const headers = response?.headers;
  if (!headers) return "";
  if (typeof headers.get === "function") return headers.get(name) || headers.get(name.toLowerCase()) || "";
  return headers[name] || headers[name.toLowerCase()] || "";
}

export async function readProxyResponse(slot, agent, response) {
  const raw = await response.text();
  let json = null;
  try {
    json = JSON.parse(raw);
  } catch {
    json = null;
  }
  if (response.status === 429) {
    throw new ProviderFailure(slot, rateLimitInfo(agent, headerValue(response, "retry-after"), "proxy"));
  }
  if (!response.ok) {
    const detail = providerMessage(json, raw).replace(/\s+/g, " ").trim();
    const tail = detail ? ` Proxy said: ${detail.slice(0, 240)}` : "";
    throw new ProviderFailure(slot, {
      code: response.status === 401 || response.status === 403 ? "auth" : "http",
      title: "Oracle proxy failed",
      message: `The BaileyOS oracle proxy returned HTTP ${response.status} for ${agent.name}. This run is paused.${tail} Step tries this slot again, or turn on Demo mode.`,
    });
  }
  const text = proxyReplyText(json, raw);
  if (!text) {
    throw new ProviderFailure(slot, {
      code: "empty",
      title: "Empty reply",
      message: `${agent.name} received no text from the oracle proxy. No turn was recorded. This run is paused.`,
    });
  }
  return text;
}

export function proxyNetworkFailure(agent, err) {
  const reason = err?.message || "failed";
  return {
    code: "network",
    title: "Proxy unreachable",
    message: `${agent.name} did not get a reply from ${proxyUrl()}. The browser reported a network error (${reason}). From this static page that is often CORS, or the oracle route is not answering yet. This run is paused. Open Use my own key on this slot, or turn on Demo mode.`,
  };
}

export async function completeProxyTurn({ slot, session, transcript, cursor, fetcher, signal }) {
  const agent = session.agents[slot];
  const prompt = buildUserPrompt(session, transcript, cursor);
  const spec = proxyRequest({
    provider: proxyProviderId(agent),
    model: agent.model,
    system: agent.role,
    messages: [{ role: "user", content: prompt }],
  });
  let response;
  try {
    response = await fetcher(spec.url, {
      ...spec.init,
      signal,
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    throw new ProviderFailure(slot, proxyNetworkFailure(agent, err));
  }
  return readProxyResponse(slot, agent, response);
}

export function networkFailure(agent, err, key) {
  const reason = scrub(err?.message || "failed", key);
  const url = agent.provider === "gemini" ? "the Generative Language API" : agent.endpoint;
  const retired = agent.provider === "github"
    ? " GitHub retired the Models inference API on July 30, 2026, so this host may no longer answer."
    : "";
  return {
    code: "network",
    title: "Call blocked",
    message: `${agent.name} did not return a response from ${url}. The browser reported a network error (${reason}). On this static page that is often CORS: the provider refused to let this origin read the response. A dropped connection looks the same. Auth failures and rate limits arrive with an HTTP status instead.${retired} Run Demo mode to keep the turn order and the referee.`,
  };
}

export async function readProviderResponse(slot, agent, response, key) {
  const raw = await response.text();
  let json = null;
  try {
    json = JSON.parse(raw);
  } catch {
    json = null;
  }
  if (!response.ok) {
    throw new ProviderFailure(slot, failureFromStatus(agent, response.status, raw, json, key));
  }
  const text = slot === "B" ? geminiText(json) : xaiText(json);
  if (!String(text || "").trim()) {
    const detail = scrub(providerMessage(json, raw), key).replace(/\s+/g, " ").trim();
    throw new ProviderFailure(slot, {
      code: "empty",
      title: "Empty reply",
      message: `${agent.name} returned no text. No turn was recorded.${detail ? ` ${detail}` : ""}`,
    });
  }
  return String(text).trim();
}

export async function completeTurn({ slot, session, transcript, cursor, key, fetcher, signal }) {
  const agent = session.agents[slot];
  const trimmedKey = String(key || "").trim();
  if (!trimmedKey) {
    const credential = agent.provider === "github" ? "personal access token" : "API key";
    const scope = agent.provider === "github" ? " A fine-grained token needs models:read." : "";
    throw new ProviderFailure(slot, {
      code: "missing-key",
      title: agent.provider === "github" ? "Token needed" : "API key needed",
      message: `${agent.name} (Slot ${slot}) has no ${credential} in this tab.${scope} Type one, or run Demo mode. It stays in memory unless you tick Remember on this device.`,
    });
  }
  const prompt = buildUserPrompt(session, transcript, cursor);
  const spec = slot === "B"
    ? geminiRequest({ key: trimmedKey, model: agent.model, system: agent.role, prompt })
    : slot === "C"
      ? githubRequest({ key: trimmedKey, model: agent.model, system: agent.role, prompt })
      : xaiRequest({ key: trimmedKey, model: agent.model, system: agent.role, prompt });
  let response;
  try {
    response = await fetcher(spec.url, {
      ...spec.init,
      signal,
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    throw new ProviderFailure(slot, networkFailure(agent, err, trimmedKey));
  }
  return readProviderResponse(slot, agent, response, trimmedKey);
}

export function transcriptDocument(session, transcript, exportedAt) {
  return {
    module: "landing-stone-simulation",
    exportedAt,
    mode: session.mode,
    scenario: session.scenario,
    objective: session.objective,
    maxRounds: session.maxRounds,
    limits: { maxWords: session.maxWords, maxChars: session.maxChars },
    objectiveWords: session.objectiveWords,
    rules: session.rules.map((rule) => ({ id: rule.id, text: describeRule(rule, session) })),
    activeSlots: activeSlots(session),
    agents: ["A", "B", "C"].map((slot) => ({
      slot,
      included: activeSlots(session).includes(slot),
      name: session.agents[slot].name,
      provider: session.agents[slot].provider,
      model: session.agents[slot].model,
      role: session.agents[slot].role,
    })),
    turns: transcript.map((turn) => ({
      round: turn.round,
      slot: turn.slot,
      name: turn.name,
      provider: turn.provider,
      model: turn.model,
      source: turn.source,
      text: turn.text,
      words: turn.referee.words,
      characters: turn.referee.chars,
      referee: turn.referee.pass ? "pass" : "flag",
      violations: turn.referee.violations,
    })),
  };
}

export function transcriptText(session, transcript) {
  const agents = activeSlots(session)
    .map((slot) => {
      const agent = session.agents[slot];
      return `Slot ${slot} ${agent.name} (${agent.model}, ${agent.provider})`;
    })
    .join(", then ");
  const rules = session.rules
    .map((rule) => `- ${rule.id}: ${describeRule(rule, session)}`)
    .join("\n");
  const turns = transcript.map((turn) => {
    const verdict = turn.referee.pass ? "PASS" : "FLAG";
    const flags = turn.referee.violations
      .map((item) => `- ${item.ruleId}: ${item.detail}`)
      .join("\n");
    return [
      `Round ${turn.round} · Slot ${turn.slot} · ${turn.name} · ${turn.model} · ${turn.source}`,
      turn.text,
      `Referee: ${verdict} · ${turn.referee.words} words · ${turn.referee.chars} characters`,
      flags,
    ].filter(Boolean).join("\n");
  }).join("\n\n");
  return [
    "LANDING STONE AGENT DRILL",
    `Mode: ${session.mode}`,
    `Scenario: ${session.scenario}`,
    `Objective: ${session.objective}`,
    `Limits: ${session.maxWords} words, ${session.maxChars} characters, ${session.maxRounds} rounds`,
    `Order: ${agents}`,
    "",
    "Rules:",
    rules,
    "",
    turns || "(no turns yet)",
    "",
  ].join("\n");
}

const STORE = "landing-stone.simulation.v1";
const TURN_GAP_MS = 450;
const DEMO_THINK_MS = 280;
const CALL_TIMEOUT_MS = 90000;

function mount() {
  const ui = {
    phase: "idle",
    cursor: { round: 1, slot: "A" },
    transcript: [],
    done: false,
    errors: { A: null, B: null, C: null },
  };
  let runToken = 0;
  let inflight = null;
  let gapCancel = null;

  const $ = (id) => document.getElementById(id);

  function fillDefaults() {
    const config = SIM_CONFIG;
    $("scenario").value = config.scenario;
    $("objective").value = config.objective;
    $("max-rounds").value = String(config.maxRounds);
    $("max-words").value = String(config.limits.maxWords);
    $("max-chars").value = String(config.limits.maxChars);
    $("objective-words").value = config.objectiveWords.join(", ");
    $("slot-c").checked = false;
    for (const slot of ["A", "B", "C"]) {
      const agent = config.agents[slot];
      $("name-" + slot).value = agent.name;
      $("model-" + slot).value = agent.model;
      $("role-" + slot).value = agent.role;
      $("provider-" + slot).textContent = agent.providerLabel;
      $("default-model-" + slot).textContent = agent.model;
      const remember = localStorage.getItem(`${STORE}.${slot}.remember`) === "1";
      $("remember-" + slot).checked = remember;
      if (remember) {
        $("key-" + slot).value = localStorage.getItem(`${STORE}.${slot}.key`) || "";
      }
    }
    $("demo-script-note").textContent =
      "Defaults load from SIM_CONFIG at the top of simulation.js. Slot C is off until you include it, and then the cycle is A, B, C. With the default word limit, the demo script’s round-2 Slot A line is over the limit so the referee flag is visible. Demo lines start with the banner " +
      DEMO_BANNER +
      ".";
  }

  function demoOn() {
    return $("demo").getAttribute("aria-pressed") === "true";
  }

  function fieldSession() {
    return readSession(SIM_CONFIG, {
      scenario: $("scenario").value,
      objective: $("objective").value,
      maxRounds: $("max-rounds").value,
      maxWords: $("max-words").value,
      maxChars: $("max-chars").value,
      objectiveWords: $("objective-words").value,
      nameA: $("name-A").value,
      modelA: $("model-A").value,
      roleA: $("role-A").value,
      nameB: $("name-B").value,
      modelB: $("model-B").value,
      roleB: $("role-B").value,
      nameC: $("name-C").value,
      modelC: $("model-C").value,
      roleC: $("role-C").value,
      slotC: $("slot-c").checked,
      mode: demoOn() ? "demo" : "proxy",
    });
  }

  function persistKey(slot) {
    const remember = $("remember-" + slot).checked;
    if (remember) {
      localStorage.setItem(`${STORE}.${slot}.remember`, "1");
      localStorage.setItem(`${STORE}.${slot}.key`, $("key-" + slot).value);
    } else {
      localStorage.removeItem(`${STORE}.${slot}.remember`);
      localStorage.removeItem(`${STORE}.${slot}.key`);
    }
  }

  function setDemo(on) {
    $("demo").setAttribute("aria-pressed", on ? "true" : "false");
    $("demo").textContent = on ? "Demo mode on" : "Demo mode";
    paint();
  }

  function paintRules(session) {
    const list = $("rules-list");
    list.replaceChildren();
    for (const rule of session.rules) {
      const item = document.createElement("li");
      const id = document.createElement("span");
      id.className = "rule-id";
      id.textContent = rule.id;
      const text = document.createElement("span");
      text.textContent = describeRule(rule, session);
      item.append(id, text);
      list.append(item);
    }
  }

  function alignCursor(session) {
    if (ui.done) return;
    if (activeSlots(session).includes(ui.cursor.slot)) return;
    const moved = advanceCursor(ui.cursor, session);
    ui.cursor = moved.cursor;
    if (moved.done) {
      ui.done = true;
      if (ui.phase !== "running") ui.phase = "done";
    }
  }

  function paintStatus(session) {
    const included = activeSlots(session);
    for (const slot of ["A", "B", "C"]) {
      const last = [...ui.transcript].reverse().find((turn) => turn.slot === slot);
      let text = "Ready";
      let kind = "ready";
      if (!included.includes(slot)) {
        text = "Off";
        kind = "off";
      } else if (ui.phase === "running" && ui.cursor.slot === slot && !ui.done) {
        text = demoOn() ? "Writing a demo line…" : "Calling the model…";
        kind = "busy";
      } else if (ui.errors[slot]) {
        text = "Error";
        kind = "error";
      } else if (last) {
        text = last.referee.pass ? "Last turn passed" : "Last turn flagged";
        kind = last.referee.pass ? "pass" : "flag";
      } else if (ui.phase === "paused") {
        text = "Paused";
        kind = "paused";
      }
      const node = $("status-" + slot);
      node.dataset.kind = kind;
      node.querySelector(".status-text").textContent = text;
      $("slot-" + slot).setAttribute("aria-busy", kind === "busy" ? "true" : "false");
      $("slot-" + slot).classList.toggle("is-off", slot === "C" && !included.includes(slot));
    }
    const proxyLine = (slot, providerId) =>
      "Proxy " + proxyUrl() + " · provider " + providerId + " · model " + session.agents[slot].model;
    $("endpoint-A").textContent = proxyLine("A", "grok");
    $("endpoint-B").textContent = proxyLine("B", "gemini");
    $("endpoint-C").textContent = proxyLine("C", "github");
    $("direct-A").textContent = "Own key: POST " + session.agents.A.endpoint + " · Authorization: Bearer";
    $("direct-B").textContent =
      "Own key: POST https://generativelanguage.googleapis.com/v1beta/models/" +
      geminiModelId(session.agents.B.model) +
      ":generateContent · header x-goog-api-key";
    $("direct-C").textContent = "Own key: POST " + session.agents.C.endpoint + " · Authorization: Bearer";
  }

  function paintErrors() {
    for (const slot of ["A", "B", "C"]) {
      const box = $("error-" + slot);
      const info = ui.errors[slot];
      box.replaceChildren();
      if (!info) {
        box.hidden = true;
        continue;
      }
      box.hidden = false;
      const title = document.createElement("p");
      title.className = "error-title";
      title.textContent = info.title;
      const detail = document.createElement("p");
      detail.textContent = info.message;
      box.append(title, detail);
      if (!demoOn()) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "Run Demo mode";
        button.addEventListener("click", () => {
          setDemo(true);
          ui.errors.A = null;
          ui.errors.B = null;
          ui.errors.C = null;
          start();
        });
        box.append(button);
      }
    }
  }

  function paintLog(session) {
    const list = $("transcript");
    list.replaceChildren();
    if (!ui.transcript.length) {
      const empty = document.createElement("li");
      empty.className = "empty";
      empty.textContent = `No turns yet. Start runs ${orderPhrase(session)} until the round limit. Step runs one turn and the referee check.`;
      list.append(empty);
      return;
    }
    for (const turn of ui.transcript) {
      const item = document.createElement("li");
      item.className = "turn " + (turn.referee.pass ? "pass" : "flag");
      const head = document.createElement("header");
      const who = document.createElement("span");
      who.textContent = `Round ${turn.round} · Slot ${turn.slot} · ${turn.name} · ${turn.model}`;
      const source = document.createElement("span");
      source.textContent = turn.source === "demo"
        ? "Demo placeholder"
        : turn.source === "own-key"
          ? "Own key"
          : "Oracle proxy";
      const mark = document.createElement("span");
      mark.textContent = turn.referee.pass ? "PASS" : "FLAG";
      head.append(who, source, mark);
      const body = document.createElement("pre");
      body.textContent = turn.text;
      const verdict = document.createElement("p");
      verdict.className = "verdict";
      const summary = `Referee: ${turn.referee.pass ? "pass" : "flag"}. ${turn.referee.words} words, ${turn.referee.chars} characters.`;
      const details = turn.referee.violations.map((item) => `${item.ruleId}: ${item.detail}`).join(" ");
      verdict.textContent = details ? `${summary} ${details}` : summary;
      item.append(head, body, verdict);
      list.append(item);
    }
    const last = list.lastElementChild;
    if (last && ui.phase !== "idle") last.scrollIntoView({ block: "nearest" });
  }

  function paint() {
    const session = fieldSession();
    alignCursor(session);
    paintRules(session);
    paintStatus(session);
    paintErrors();
    paintLog(session);
    const flags = ui.transcript.filter((turn) => !turn.referee.pass).length;
    const next = ui.done
      ? `Complete · ${ui.transcript.length} turns`
      : `Round ${ui.cursor.round} of ${session.maxRounds} · next Slot ${ui.cursor.slot} · ${session.agents[ui.cursor.slot].name}`;
    $("order-line").textContent = `Order: ${orderPhrase(session)}. ${next}.`;
    $("stats-line").textContent = `Turns ${ui.transcript.length} · Flags ${flags} · Mode ${session.mode}`;
    const own = ["A", "B", "C"].filter((slot) => $("own-" + slot).open && activeSlots(session).includes(slot));
    let note = `Turn order is ${orderPhrase(session)}. Live turns use the BaileyOS oracle proxy. No key is required. Start runs every round. Step takes one turn and runs the referee.`;
    if (own.length) note += ` ${own.map((slot) => "Slot " + slot).join(" and ")} is set to use a key from this browser.`;
    if (ui.phase === "running") note = `${next}. Pause stops before the next turn.`;
    else if (ui.phase === "paused") note = `Paused. ${next}.`;
    else if (ui.done) note = `Complete. The shared log has ${ui.transcript.length} turns. Export JSON or text, or Reset to run again.`;
    if (demoOn()) note += " Demo mode is on. Each turn is a labeled placeholder. The referee still checks it.";
    $("run-note").textContent = note;
    $("start").disabled = ui.phase === "running" || ui.done;
    $("pause").disabled = ui.phase !== "running";
    $("step").disabled = ui.phase === "running" || ui.done;
  }

  function showFailure(slot, info) {
    ui.errors[slot] = { title: info.title, message: info.message };
    ui.phase = "paused";
  }

  function wait(ms) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        gapCancel = null;
        resolve();
      }, ms);
      gapCancel = () => {
        clearTimeout(timer);
        gapCancel = null;
        resolve();
      };
    });
  }

  async function produceTurn(session, token) {
    const slot = ui.cursor.slot;
    ui.errors[slot] = null;
    const controller = new AbortController();
    inflight = { controller, reason: "" };
    const timer = setTimeout(() => {
      if (inflight) inflight.reason = "timeout";
      controller.abort();
    }, CALL_TIMEOUT_MS);
    try {
      if (session.mode === "demo") {
        await wait(DEMO_THINK_MS);
        if (controller.signal.aborted || token !== runToken) {
          throw new DOMException("aborted", "AbortError");
        }
        const previous = ui.transcript[ui.transcript.length - 1];
        return {
          text: demoTurnText({
            round: ui.cursor.round,
            slot,
            previousName: previous ? previous.name : "",
          }),
          source: "demo",
        };
      }
      const own = $("own-" + slot).open;
      const text = own
        ? await completeTurn({
          slot,
          session,
          transcript: ui.transcript,
          cursor: ui.cursor,
          key: $("key-" + slot).value,
          fetcher: (url, init) => fetch(url, init),
          signal: controller.signal,
        })
        : await completeProxyTurn({
          slot,
          session,
          transcript: ui.transcript,
          cursor: ui.cursor,
          fetcher: (url, init) => fetch(url, init),
          signal: controller.signal,
        });
      return { text, source: own ? "own-key" : "proxy" };
    } catch (err) {
      if (err?.name === "AbortError") {
        if (inflight?.reason === "timeout") {
          const agent = session.agents[slot];
          showFailure(slot, {
            title: "Call timed out",
            message: `${agent.name} did not answer within 90 seconds. Step tries this slot again, or run Demo mode.`,
          });
        }
        return null;
      }
      if (err instanceof ProviderFailure) {
        showFailure(slot, err.info);
        return null;
      }
      showFailure(slot, {
        title: "Call failed",
        message: scrub(err?.message || "Unknown error", $("key-" + slot).value.trim()),
      });
      return null;
    } finally {
      clearTimeout(timer);
      inflight = null;
    }
  }

  async function step(token) {
    if (ui.done || token !== runToken) return false;
    const session = fieldSession();
    alignCursor(session);
    if (ui.done) {
      ui.phase = "done";
      paint();
      return false;
    }
    if (ui.cursor.round > session.maxRounds) {
      ui.done = true;
      ui.phase = "done";
      return false;
    }
    paint();
    const produced = await produceTurn(session, token);
    if (produced == null || token !== runToken) return false;
    const result = adjudicate({
      session,
      transcript: ui.transcript,
      cursor: ui.cursor,
      text: produced.text,
      source: produced.source,
    });
    ui.transcript = result.transcript;
    ui.cursor = result.cursor;
    ui.done = result.done;
    if (result.done) ui.phase = "done";
    paint();
    return true;
  }

  async function start() {
    if (ui.phase === "running" || ui.done) return;
    ui.phase = "running";
    const token = runToken;
    paint();
    while (runToken === token && ui.phase === "running" && !ui.done) {
      const ok = await step(token);
      if (!ok || ui.done || ui.phase !== "running" || runToken !== token) break;
      await wait(TURN_GAP_MS);
      if (ui.phase !== "running" || runToken !== token) break;
    }
    if (runToken === token && ui.phase === "running") ui.phase = ui.done ? "done" : "paused";
    paint();
  }

  function pause() {
    if (ui.phase !== "running") return;
    ui.phase = "paused";
    if (gapCancel) gapCancel();
    if (inflight) {
      inflight.reason = "pause";
      inflight.controller.abort();
    }
    paint();
  }

  function reset() {
    runToken += 1;
    if (gapCancel) gapCancel();
    if (inflight) {
      inflight.reason = "reset";
      inflight.controller.abort();
    }
    ui.phase = "idle";
    ui.cursor = { round: 1, slot: "A" };
    ui.transcript = [];
    ui.done = false;
    ui.errors = { A: null, B: null, C: null };
    paint();
  }

  function download(filename, contents, type) {
    const blob = new Blob([contents], { type });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function exportNow(kind) {
    const session = fieldSession();
    if (ui.transcript.length) {
      const sources = [...new Set(ui.transcript.map((turn) => turn.source))];
      session.mode = sources.length === 1 ? sources[0] : sources.join("+");
    }
    const stamp = new Date().toISOString();
    if (kind === "json") {
      const doc = transcriptDocument(session, ui.transcript, stamp);
      download("landing-stone-simulation.json", JSON.stringify(doc, null, 2), "application/json");
      return;
    }
    download("landing-stone-simulation.txt", transcriptText(session, ui.transcript), "text/plain");
  }

  fillDefaults();
  for (const slot of ["A", "B", "C"]) {
    $("key-" + slot).addEventListener("input", () => persistKey(slot));
    $("remember-" + slot).addEventListener("change", () => persistKey(slot));
    $("own-" + slot).addEventListener("toggle", () => {
      if (ui.phase !== "running") paint();
    });
  }
  $("slot-c").addEventListener("change", () => {
    if (ui.phase !== "running") paint();
  });
  for (const id of ["scenario", "objective", "max-rounds", "max-words", "max-chars", "objective-words", "name-A", "name-B", "name-C", "model-A", "model-B", "model-C", "role-A", "role-B", "role-C"]) {
    $(id).addEventListener("input", () => {
      if (ui.phase !== "running") paint();
    });
  }
  $("start").addEventListener("click", start);
  $("pause").addEventListener("click", pause);
  $("step").addEventListener("click", async () => {
    if (ui.phase === "running" || ui.done) return;
    ui.phase = "running";
    const token = runToken;
    paint();
    await step(token);
    if (runToken === token && ui.phase === "running") ui.phase = ui.done ? "done" : "paused";
    paint();
  });
  $("reset").addEventListener("click", reset);
  $("demo").addEventListener("click", () => setDemo(!demoOn()));
  $("export-json").addEventListener("click", () => exportNow("json"));
  $("export-text").addEventListener("click", () => exportNow("text"));
  paint();
}

if (typeof document !== "undefined") {
  mount();
}
