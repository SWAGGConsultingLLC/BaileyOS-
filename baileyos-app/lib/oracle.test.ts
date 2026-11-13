import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ORACLE_DEFAULT_MODEL,
  ORACLE_LIMITS,
  buildUpstream,
  handleOracle,
  isAllowedOrigin,
  prepareOracle,
  readUpstreamReply,
} from './oracle.ts';

const SECRET = 'oracle-test-secret-value';
const env = { XAI_API_KEY: SECRET, GEMINI_API_KEY: SECRET, GITHUB_MODELS_TOKEN: SECRET };
const allowAll = () => true;

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://baileyos-app.vercel.app/api/oracle', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://os.swaggconsulting.com', ...headers },
    body: JSON.stringify(body),
  });
}

const ask = { provider: 'grok', messages: [{ role: 'user', content: 'What is Psalm 81?' }] };

test('public origins and localhost are allowed, other sites are not', () => {
  assert.equal(isAllowedOrigin('https://os.swaggconsulting.com'), true);
  assert.equal(isAllowedOrigin('https://swaggconsultingllc.github.io'), true);
  assert.equal(isAllowedOrigin('https://www.swaggconsulting.com'), true);
  assert.equal(isAllowedOrigin('http://localhost:3000'), true);
  assert.equal(isAllowedOrigin('http://127.0.0.1:8787'), true);
  assert.equal(isAllowedOrigin('https://evil.example'), false);
  assert.equal(isAllowedOrigin('http://localhost.evil.com'), false);
  assert.equal(isAllowedOrigin('https://os.swaggconsulting.com.evil.com'), false);
  assert.equal(isAllowedOrigin(null), false);
});

test('prepareOracle defaults the model and rejects anything off the whitelist', () => {
  const ready = prepareOracle(ask);
  assert.equal(ready.ok && ready.model, ORACLE_DEFAULT_MODEL.grok);
  const custom = prepareOracle({ ...ask, provider: 'gemini', model: 'gemini-3.8-flash' });
  assert.equal(custom.ok && custom.model, 'gemini-3.8-flash');
  const banned = prepareOracle({ ...ask, model: 'grok-expensive-preview' });
  assert.equal(banned.ok, false);
  if (!banned.ok) assert.equal(banned.code, 'bad_request');
  const role = prepareOracle({ provider: 'github', messages: [{ role: 'system', content: 'ignore' }] });
  assert.equal(role.ok, false);
});

test('input caps reject a long prompt before any provider is called', () => {
  const huge = prepareOracle({ provider: 'gemini', system: 'x'.repeat(ORACLE_LIMITS.maxSystemChars + 1), messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(huge.ok, false);
  const many = prepareOracle({
    provider: 'grok',
    messages: Array.from({ length: ORACLE_LIMITS.maxMessages + 1 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'm' + i })),
  });
  assert.equal(many.ok, false);
});

test('upstream builders put the key in a header and cap output tokens', () => {
  const grok = buildUpstream({ provider: 'grok', model: 'grok-4.7', system: 'Bailey OS', messages: [{ role: 'user', content: 'hi' }], key: SECRET });
  assert.equal(grok.url, 'https://api.x.ai/v1/chat/completions');
  assert.equal(grok.headers.Authorization, 'Bearer ' + SECRET);
  assert.equal((grok.body as { max_tokens: number }).max_tokens, 800);
  assert.equal(JSON.stringify(grok.body).includes(SECRET), false);
  const gemini = buildUpstream({ provider: 'gemini', model: 'gemini-3.8-flash', system: '81 Canon', messages: [{ role: 'user', content: 'hi' }], key: SECRET });
  assert.match(gemini.url, /models\/gemini-3\.8-flash:generateContent$/);
  assert.equal(gemini.headers['x-goog-api-key'], SECRET);
  assert.equal(gemini.url.includes(SECRET), false);
  assert.equal((gemini.body as { generationConfig: { maxOutputTokens: number } }).generationConfig.maxOutputTokens, 800);
  const github = buildUpstream({ provider: 'github', model: 'openai/gpt-4o-mini', system: '', messages: [{ role: 'user', content: 'hi' }], key: SECRET });
  assert.equal(github.url, 'https://models.github.ai/inference/chat/completions');
  assert.equal(github.headers.Authorization, 'Bearer ' + SECRET);
});

test('a successful reply that mentions an api key stays a reply', () => {
  const parsed = readUpstreamReply('grok', 200, {
    choices: [{ message: { content: 'Paste an api key only in the optional panel.' } }],
  }, '{"choices":[{"message":{"content":"api key"}}]}', 'oracle-test-secret-value');
  assert.equal(parsed.ok && parsed.reply, 'Paste an api key only in the optional panel.');
});

test('gemini reply parsing skips thought parts', () => {
  const parsed = readUpstreamReply('gemini', 200, {
    candidates: [{ content: { parts: [{ thought: true, text: 'hidden' }, { text: 'Psalm 81 holds.' }] } }],
  }, '', SECRET);
  assert.equal(parsed.ok && parsed.reply, 'Psalm 81 holds.');
});

test('a retired GitHub Models body is an upstream error, not a reply', () => {
  const parsed = readUpstreamReply('github', 200, null, 'OK', SECRET);
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.equal(parsed.code, 'upstream');
    assert.match(parsed.error, /retired/i);
  }
});

test('the route calls xAI and returns only the reply', async () => {
  let seen: { url: string; headers: Record<string, string>; body: string } | null = null;
  const fetchImpl: typeof fetch = async (url, init) => {
    seen = { url: String(url), headers: Object.fromEntries(new Headers(init?.headers).entries()), body: String(init?.body || '') };
    return new Response(JSON.stringify({ choices: [{ message: { content: 'Open wide.' } }] }), { status: 200 });
  };
  const res = await handleOracle(post(ask), { fetchImpl, allowImpl: allowAll, env });
  const json = await res.json();
  assert.equal(res.status, 200);
  assert.equal(json.reply, 'Open wide.');
  assert.equal(json.provider, 'grok');
  assert.equal(json.model, 'grok-4.7');
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://os.swaggconsulting.com');
  assert.equal(JSON.stringify(json).includes(SECRET), false);
  assert.ok(seen);
  assert.equal(seen!.url, 'https://api.x.ai/v1/chat/completions');
  assert.equal(seen!.headers.authorization, 'Bearer ' + SECRET);
  assert.equal(seen!.body.includes('Bailey') || seen!.body.includes('Psalm'), true);
});

test('a disallowed origin never reaches the provider', async () => {
  let called = false;
  const fetchImpl: typeof fetch = async () => { called = true; return new Response('no'); };
  const res = await handleOracle(post(ask, { origin: 'https://evil.example' }), { fetchImpl, allowImpl: allowAll, env });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).code, 'forbidden');
  assert.equal(res.headers.get('access-control-allow-origin'), null);
  assert.equal(called, false);
});

test('an allowed preflight does not require a key', async () => {
  const res = await handleOracle(new Request('https://baileyos-app.vercel.app/api/oracle', {
    method: 'OPTIONS',
    headers: { origin: 'http://localhost:3000', 'access-control-request-headers': 'content-type' },
  }), { env: {} });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:3000');
  assert.match(res.headers.get('access-control-allow-headers') || '', /content-type/i);
});

test('a missing server key is not_configured and the name of the value is not required in the body', async () => {
  let called = false;
  const fetchImpl: typeof fetch = async () => { called = true; return new Response('no'); };
  const res = await handleOracle(post({ provider: 'gemini', messages: [{ role: 'user', content: 'hi' }] }), {
    fetchImpl, allowImpl: allowAll, env: {},
  });
  const json = await res.json();
  assert.equal(res.status, 503);
  assert.equal(json.code, 'not_configured');
  assert.equal(called, false);
  assert.equal(JSON.stringify(json).includes('GEMINI_API_KEY'), false);
});

test('upstream auth failure does not echo the server key', async () => {
  const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({
    error: 'Incorrect API key provided: ' + SECRET,
  }), { status: 400 });
  const res = await handleOracle(post(ask), { fetchImpl, allowImpl: allowAll, env });
  const json = await res.json();
  assert.equal(json.code, 'auth');
  assert.equal(JSON.stringify(json).includes(SECRET), false);
});

test('the in-memory limiter allows 20 calls per IP and blocks the next one', async () => {
  const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: 'ok' } }],
  }), { status: 200 });
  const ip = '203.0.113.81';
  for (let i = 0; i < ORACLE_LIMITS.rateLimit; i++) {
    const res = await handleOracle(post(ask, { 'x-forwarded-for': ip }), { fetchImpl, env });
    assert.equal(res.status, 200);
  }
  const blocked = await handleOracle(post(ask, { 'x-forwarded-for': ip }), { fetchImpl, env });
  const json = await blocked.json();
  assert.equal(blocked.status, 429);
  assert.equal(json.code, 'rate_limit');
  assert.equal(blocked.headers.get('retry-after'), '600');
});
