import { allow as memoryAllow } from './rateLimit';

/**
 * POST /api/oracle
 *
 * Public oracles for Signal Ark and Landing Stone. The browser sends no API key.
 * Server credentials are read from process.env and are never logged or returned.
 *
 * Request JSON:
 *   {
 *     "provider": "grok" | "gemini" | "github",
 *     "model"?: string,          // optional; must be on that provider's whitelist
 *     "system"?: string,         // optional system prompt
 *     "messages": [{ "role": "user" | "assistant", "content": string }]
 *   }
 * The last message must be role "user". Do not put a system role inside messages.
 *
 * Success 200:
 *   { "reply": string, "provider": "grok" | "gemini" | "github", "model": string }
 *
 * Failure JSON always includes "error" and "code":
 *   400 bad_request     body failed validation
 *   403 forbidden       Origin is not on the allow list
 *   401 auth            the upstream rejected the server credential
 *   429 rate_limit      this proxy (20 / 10 min / IP) or the upstream
 *   502 upstream        the provider failed, including GitHub Models' retired endpoint
 *   503 not_configured  that provider's env var is empty
 *
 * CORS allows https://os.swaggconsulting.com, https://swaggconsultingllc.github.io,
 * https://www.swaggconsulting.com, and http(s) localhost / 127.0.0.1 / ::1.
 * A request with no Origin (a server caller) is accepted and still rate limited.
 *
 * Rate limits use the in-memory fixed window in lib/rateLimit.ts (key "oracle:<ip>").
 * On Vercel that counter is per instance, same as the map's placement limiter.
 * There is no Redis or KV in this app.
 */

export const ORACLE_PROVIDERS = ['grok', 'gemini', 'github'] as const;
export type OracleProvider = (typeof ORACLE_PROVIDERS)[number];

/** Ids verified 2026-11-13. Add a model here before any client may request it. */
export const ORACLE_MODELS: Record<OracleProvider, readonly string[]> = {
  grok: ['grok-4.7'],
  gemini: ['gemini-3.8-flash'],
  github: ['openai/gpt-4o-mini'],
};

export const ORACLE_DEFAULT_MODEL: Record<OracleProvider, string> = {
  grok: 'grok-4.7',
  gemini: 'gemini-3.8-flash',
  github: 'openai/gpt-4o-mini',
};

export const ORACLE_ENV: Record<OracleProvider, string> = {
  grok: 'XAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
  github: 'GITHUB_MODELS_TOKEN',
};

export const ORACLE_ORIGINS = [
  'https://os.swaggconsulting.com',
  'https://swaggconsultingllc.github.io',
  'https://www.swaggconsulting.com',
] as const;

export const ORACLE_LIMITS = {
  maxMessages: 16,
  maxSystemChars: 8000,
  maxMessageChars: 4000,
  maxTotalChars: 12000,
  maxOutputTokens: 800,
  maxBodyBytes: 48_000,
  rateLimit: 20,
  rateWindowMs: 10 * 60 * 1000,
};

const PROVIDER_NAMES: Record<OracleProvider, string> = {
  grok: 'Grok',
  gemini: 'Gemini',
  github: 'GitHub Models',
};

export type OracleMessage = { role: 'user' | 'assistant'; content: string };

export type OracleReady = {
  ok: true;
  provider: OracleProvider;
  model: string;
  system: string;
  messages: OracleMessage[];
};

export type OracleReject = { ok: false; status: number; code: string; error: string };

export type OracleDeps = {
  fetchImpl?: typeof fetch;
  allowImpl?: (key: string, limit: number, windowMs: number) => boolean;
  env?: Record<string, string | undefined>;
};

export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if ((ORACLE_ORIGINS as readonly string[]).includes(origin)) return true;
  let url: URL;
  try { url = new URL(origin); } catch { return false; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return false;
  return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]' || url.hostname === '::1';
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for') || '';
  const first = forwarded.split(',')[0]?.trim() || '';
  if (first) return first.slice(0, 128);
  const real = (req.headers.get('x-real-ip') || '').trim();
  if (real) return real.slice(0, 128);
  return 'unknown';
}

function isProvider(value: unknown): value is OracleProvider {
  return typeof value === 'string' && (ORACLE_PROVIDERS as readonly string[]).includes(value);
}

export function prepareOracle(body: unknown): OracleReady | OracleReject {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, status: 400, code: 'bad_request', error: 'Request body must be a JSON object.' };
  }
  const record = body as Record<string, unknown>;
  if (!isProvider(record.provider)) {
    return { ok: false, status: 400, code: 'bad_request', error: 'provider must be grok, gemini, or github.' };
  }
  const provider = record.provider;
  let model = ORACLE_DEFAULT_MODEL[provider];
  if (record.model != null && record.model !== '') {
    if (typeof record.model !== 'string' || !ORACLE_MODELS[provider].includes(record.model)) {
      return { ok: false, status: 400, code: 'bad_request', error: 'That model id is not allowed for ' + provider + '.' };
    }
    model = record.model;
  }
  let system = '';
  if (record.system != null && record.system !== '') {
    if (typeof record.system !== 'string') {
      return { ok: false, status: 400, code: 'bad_request', error: 'system must be a string.' };
    }
    system = record.system;
    if (system.length > ORACLE_LIMITS.maxSystemChars) {
      return { ok: false, status: 400, code: 'bad_request', error: 'system is too long.' };
    }
  }
  if (!Array.isArray(record.messages) || record.messages.length === 0) {
    return { ok: false, status: 400, code: 'bad_request', error: 'messages must be a non-empty array.' };
  }
  if (record.messages.length > ORACLE_LIMITS.maxMessages) {
    return { ok: false, status: 400, code: 'bad_request', error: 'Too many messages.' };
  }
  const messages: OracleMessage[] = [];
  let total = system.length;
  for (const item of record.messages) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { ok: false, status: 400, code: 'bad_request', error: 'Each message needs a role and content.' };
    }
    const msg = item as Record<string, unknown>;
    if (msg.role !== 'user' && msg.role !== 'assistant') {
      return { ok: false, status: 400, code: 'bad_request', error: 'Message role must be user or assistant.' };
    }
    if (typeof msg.content !== 'string' || !msg.content.trim()) {
      return { ok: false, status: 400, code: 'bad_request', error: 'Each message needs text content.' };
    }
    if (msg.content.length > ORACLE_LIMITS.maxMessageChars) {
      return { ok: false, status: 400, code: 'bad_request', error: 'A message is too long.' };
    }
    total += msg.content.length;
    messages.push({ role: msg.role, content: msg.content });
  }
  if (total > ORACLE_LIMITS.maxTotalChars) {
    return { ok: false, status: 400, code: 'bad_request', error: 'The prompt is too long.' };
  }
  if (messages[messages.length - 1].role !== 'user') {
    return { ok: false, status: 400, code: 'bad_request', error: 'The last message must be from the user.' };
  }
  return { ok: true, provider, model, system, messages };
}

export function buildUpstream(args: {
  provider: OracleProvider;
  model: string;
  system: string;
  messages: OracleMessage[];
  key: string;
}): { url: string; headers: Record<string, string>; body: unknown } {
  const { provider, model, system, messages, key } = args;
  const chat = system
    ? [{ role: 'system' as const, content: system }, ...messages]
    : messages;
  if (provider === 'grok') {
    return {
      url: 'https://api.x.ai/v1/chat/completions',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: { model, stream: false, max_tokens: ORACLE_LIMITS.maxOutputTokens, messages: chat },
    };
  }
  if (provider === 'github') {
    return {
      url: 'https://models.github.ai/inference/chat/completions',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + key,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: { model, stream: false, max_tokens: ORACLE_LIMITS.maxOutputTokens, messages: chat },
    };
  }
  return {
    url: 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: {
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents: messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      generationConfig: {
        maxOutputTokens: ORACLE_LIMITS.maxOutputTokens,
        thinkingConfig: { thinkingLevel: 'LOW' },
      },
    },
  };
}

function textFromParts(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (!Array.isArray(value)) return '';
  return value.map((part) => {
    if (typeof part === 'string') return part;
    if (part && typeof part === 'object' && 'text' in part && typeof (part as { text?: unknown }).text === 'string') {
      return (part as { text: string }).text;
    }
    return '';
  }).join('').trim();
}

export function readUpstreamReply(provider: OracleProvider, status: number, data: unknown, raw: string, secret: string):
  { ok: true; reply: string } | OracleReject {
  const name = PROVIDER_NAMES[provider];
  if (status >= 200 && status < 300) {
    if (provider === 'github' && !chatReply(data)) {
      return {
        ok: false,
        status: 502,
        code: 'upstream',
        error: 'GitHub Models did not return a chat completion. GitHub retired the inference API on July 30, 2026.',
      };
    }
    const reply = provider === 'gemini' ? geminiText(data) : chatReply(data);
    if (!reply) return { ok: false, status: 502, code: 'upstream', error: name + ' returned no reply text.' };
    return { ok: true, reply };
  }
  const snippet = rawSnippet(data, raw);
  if (status === 429 || /rate limit|too many requests|resource_exhausted|quota/i.test(snippet)) {
    return { ok: false, status: 429, code: 'rate_limit', error: name + ' rate limit reached. Wait and try again.' };
  }
  if (status === 401 || status === 403 || /api key|unauthorized|invalid authentication|permission denied|unauthenticated/i.test(snippet)) {
    return { ok: false, status: 401, code: 'auth', error: 'The server credential for ' + name + ' was rejected.' };
  }
  const detail = safeDetail(snippet, secret);
  return {
    ok: false,
    status: 502,
    code: 'upstream',
    error: name + ' returned HTTP ' + status + '.' + (detail ? ' ' + detail : ''),
  };
}

function chatReply(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const choice = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choice) || !choice[0] || typeof choice[0] !== 'object') return '';
  const message = (choice[0] as { message?: unknown }).message;
  if (!message || typeof message !== 'object') return '';
  return textFromParts((message as { content?: unknown }).content);
}

function geminiText(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const candidates = (data as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || !candidates[0] || typeof candidates[0] !== 'object') return '';
  const content = (candidates[0] as { content?: unknown }).content;
  if (!content || typeof content !== 'object') return '';
  const parts = (content as { parts?: unknown }).parts;
  if (!Array.isArray(parts)) return '';
  return parts.filter((part) => {
    if (!part || typeof part !== 'object') return false;
    const row = part as { text?: unknown; thought?: unknown };
    return typeof row.text === 'string' && row.thought !== true;
  }).map((part) => (part as { text: string }).text).join('\n').trim();
}

function rawSnippet(data: unknown, raw: string): string {
  if (data && typeof data === 'object') {
    const record = data as { error?: unknown; message?: unknown };
    if (typeof record.error === 'string') return record.error;
    if (record.error && typeof record.error === 'object' && typeof (record.error as { message?: unknown }).message === 'string') {
      return (record.error as { message: string }).message;
    }
    if (typeof record.message === 'string') return record.message;
  }
  return raw;
}

function safeDetail(text: string, secret: string): string {
  let out = text.replace(/\s+/g, ' ').trim();
  if (secret) out = out.split(secret).join('');
  if (/bearer\s+\S+/i.test(out) || /sk-[a-z0-9]/i.test(out) || /AIza/i.test(out) || /github_pat_/i.test(out) || /xai-/i.test(out)) return '';
  return out.slice(0, 180);
}

function corsHeaders(origin: string | null): Headers {
  const headers = new Headers();
  headers.set('Vary', 'Origin');
  headers.set('Cache-Control', 'no-store');
  if (origin && isAllowedOrigin(origin)) headers.set('Access-Control-Allow-Origin', origin);
  return headers;
}

function jsonResponse(origin: string | null, status: number, body: unknown, extra?: Record<string, string>): Response {
  const headers = corsHeaders(origin);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  if (extra) for (const [key, value] of Object.entries(extra)) headers.set(key, value);
  return new Response(JSON.stringify(body), { status, headers });
}

export async function handleOracle(req: Request, deps: OracleDeps = {}): Promise<Response> {
  const origin = req.headers.get('origin');
  if (origin && !isAllowedOrigin(origin)) {
    return jsonResponse(null, 403, { error: 'Origin is not allowed.', code: 'forbidden' });
  }
  if (req.method === 'OPTIONS') {
    const headers = corsHeaders(origin);
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
    headers.set('Access-Control-Max-Age', '86400');
    return new Response(null, { status: 204, headers });
  }
  if (req.method !== 'POST') {
    return jsonResponse(origin, 405, { error: 'Use POST.', code: 'bad_request' });
  }

  const allowImpl = deps.allowImpl || memoryAllow;
  const ip = clientIp(req);
  if (!allowImpl('oracle:' + ip, ORACLE_LIMITS.rateLimit, ORACLE_LIMITS.rateWindowMs)) {
    return jsonResponse(origin, 429, {
      error: 'Too many oracle requests from this network. Try again in a few minutes.',
      code: 'rate_limit',
    }, { 'Retry-After': String(Math.ceil(ORACLE_LIMITS.rateWindowMs / 1000)) });
  }

  const declared = Number(req.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > ORACLE_LIMITS.maxBodyBytes) {
    return jsonResponse(origin, 400, { error: 'Request body is too large.', code: 'bad_request' });
  }

  let payload: unknown;
  try { payload = await req.json(); } catch {
    return jsonResponse(origin, 400, { error: 'Request body must be JSON.', code: 'bad_request' });
  }
  const prepared = prepareOracle(payload);
  if (!prepared.ok) return jsonResponse(origin, prepared.status, { error: prepared.error, code: prepared.code });

  const env = deps.env || process.env;
  const secret = (env[ORACLE_ENV[prepared.provider]] || '').trim();
  if (!secret) {
    return jsonResponse(origin, 503, {
      error: PROVIDER_NAMES[prepared.provider] + ' is not configured on the server.',
      code: 'not_configured',
    });
  }

  const upstream = buildUpstream({
    provider: prepared.provider,
    model: prepared.model,
    system: prepared.system,
    messages: prepared.messages,
    key: secret,
  });
  const fetchImpl = deps.fetchImpl || fetch;
  let res: Response;
  try {
    res = await fetchImpl(upstream.url, {
      method: 'POST',
      headers: upstream.headers,
      body: JSON.stringify(upstream.body),
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    return jsonResponse(origin, 502, {
      error: 'Could not reach ' + PROVIDER_NAMES[prepared.provider] + '.',
      code: 'upstream',
    });
  }

  const raw = await res.text();
  let data: unknown = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
  const parsed = readUpstreamReply(prepared.provider, res.status, data, raw, secret);
  if (!parsed.ok) return jsonResponse(origin, parsed.status, { error: parsed.error, code: parsed.code });
  const body = JSON.stringify({ reply: parsed.reply, provider: prepared.provider, model: prepared.model });
  if (secret && body.includes(secret)) {
    return jsonResponse(origin, 502, { error: PROVIDER_NAMES[prepared.provider] + ' returned an unusable reply.', code: 'upstream' });
  }
  return jsonResponse(origin, 200, { reply: parsed.reply, provider: prepared.provider, model: prepared.model });
}
