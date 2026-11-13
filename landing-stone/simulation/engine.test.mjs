import assert from "node:assert/strict";
import test from "node:test";
import {
  SIM_CONFIG,
  PROXY_BASE,
  DEMO_BANNER,
  activeSlots,
  advanceCursor,
  adjudicate,
  buildUserPrompt,
  completeProxyTurn,
  completeTurn,
  demoTurnText,
  failureFromStatus,
  githubRequest,
  networkFailure,
  playDrill,
  proxyRequest,
  readProxyResponse,
  readSession,
  refereeTurn,
  transcriptDocument,
  transcriptText,
  wordCount,
  xaiRequest,
  geminiRequest,
  ProviderFailure,
} from "./simulation.js";

function session(overrides = {}) {
  return readSession(SIM_CONFIG, {
    mode: "demo",
    slotC: false,
    ...overrides,
  });
}

test("default session is A then B, with Slot C available and off", () => {
  const two = session();
  assert.deepEqual(activeSlots(two), ["A", "B"]);
  assert.equal(two.agents.A.model, "grok-4.7");
  assert.equal(two.agents.B.model, "gemini-3.8-flash");
  assert.equal(two.agents.C.model, "openai/gpt-4o-mini");
  assert.equal(two.agents.C.endpoint, "https://models.github.ai/inference/chat/completions");
  assert.equal(two.slotC, false);
  assert.deepEqual(activeSlots(session({ slotC: true })), ["A", "B", "C"]);
});

test("cursor cycles A, B, then C only when Slot C is included", () => {
  const two = session();
  let cursor = { round: 1, slot: "A" };
  cursor = advanceCursor(cursor, two).cursor;
  assert.deepEqual(cursor, { round: 1, slot: "B" });
  const afterB = advanceCursor(cursor, two);
  assert.equal(afterB.done, false);
  assert.deepEqual(afterB.cursor, { round: 2, slot: "A" });

  const three = session({ slotC: true });
  const toC = advanceCursor({ round: 1, slot: "B" }, three);
  assert.deepEqual(toC.cursor, { round: 1, slot: "C" });
  assert.equal(toC.done, false);
  const nextRound = advanceCursor(toC.cursor, three);
  assert.deepEqual(nextRound.cursor, { round: 2, slot: "A" });

  const finished = advanceCursor({ round: 3, slot: "C" }, three);
  assert.equal(finished.done, true);

  const dropped = advanceCursor({ round: 2, slot: "C" }, two);
  assert.equal(dropped.done, false);
  assert.deepEqual(dropped.cursor, { round: 3, slot: "A" });
  const droppedLast = advanceCursor({ round: 3, slot: "C" }, two);
  assert.equal(droppedLast.done, true);
});

test("two-slot demo runs three rounds and flags only the long turn", async () => {
  const drill = session();
  const transcript = await playDrill(drill, async ({ cursor, previousName }) => {
    return demoTurnText({ round: cursor.round, slot: cursor.slot, previousName });
  });
  assert.equal(transcript.length, 6);
  assert.deepEqual(
    transcript.map((turn) => `${turn.round}:${turn.slot}`),
    ["1:A", "1:B", "2:A", "2:B", "3:A", "3:B"],
  );
  const flagged = transcript.filter((turn) => !turn.referee.pass);
  assert.equal(flagged.length, 1);
  assert.equal(flagged[0].slot, "A");
  assert.equal(flagged[0].round, 2);
  assert.deepEqual(flagged[0].referee.violations.map((item) => item.ruleId), ["word-limit"]);
  for (const turn of transcript) {
    assert.ok(turn.text.startsWith(DEMO_BANNER));
    assert.ok(turn.referee.words <= drill.maxWords || turn === flagged[0]);
  }
  assert.ok(wordCount(transcript[0].text) < drill.maxWords);
  assert.ok(transcript[0].text.includes("opening turn"));
});

test("three-slot demo cycles A B C and still flags only round 2 slot A", async () => {
  const drill = session({ slotC: true });
  const transcript = await playDrill(drill, async ({ cursor, previousName }) => {
    return demoTurnText({ round: cursor.round, slot: cursor.slot, previousName });
  });
  assert.equal(transcript.length, 9);
  assert.deepEqual(
    transcript.map((turn) => turn.slot),
    ["A", "B", "C", "A", "B", "C", "A", "B", "C"],
  );
  const flagged = transcript.filter((turn) => !turn.referee.pass);
  assert.equal(flagged.length, 1);
  assert.equal(flagged[0].round, 2);
  assert.equal(flagged[0].slot, "A");
  const slotC = transcript.filter((turn) => turn.slot === "C");
  assert.equal(slotC.length, 3);
  assert.ok(slotC.every((turn) => turn.referee.pass));
  assert.ok(slotC.every((turn) => turn.text.includes(DEMO_BANNER)));
  assert.ok(transcript[2].text.includes("Gemini"));
  assert.ok(transcript[3].text.includes("GitHub Models"));
});

test("referee flags secrets, insults, missing structure, and char limit", () => {
  const drill = session();
  const base = "opening turn\nHEADING: shared landing continuity\nRISK: a short risk\n";
  const secret = refereeTurn({
    text: base + " token ghp_abcdefghijklmnopqrst",
    slot: "A",
    expectedSlot: "A",
    previousSpeaker: "",
    session: drill,
  });
  assert.ok(secret.violations.some((item) => item.ruleId === "no-secrets"));

  const insult = refereeTurn({
    text: base + " you are a fool",
    slot: "A",
    expectedSlot: "A",
    previousSpeaker: "",
    session: drill,
  });
  assert.ok(insult.violations.some((item) => item.ruleId === "civility"));

  const missing = refereeTurn({
    text: "opening turn\nHEADING: shared landing continuity",
    slot: "A",
    expectedSlot: "A",
    previousSpeaker: "",
    session: drill,
  });
  assert.ok(missing.violations.some((item) => item.ruleId === "structure"));

  const huge = refereeTurn({
    text: base + "x".repeat(drill.maxChars),
    slot: "A",
    expectedSlot: "A",
    previousSpeaker: "",
    session: drill,
  });
  assert.ok(huge.violations.some((item) => item.ruleId === "char-limit"));

  const order = refereeTurn({
    text: base,
    slot: "B",
    expectedSlot: "A",
    previousSpeaker: "",
    session: drill,
  });
  assert.ok(order.violations.some((item) => item.ruleId === "turn-order"));
});

test("demo banner is not counted toward the word limit", () => {
  const text = `${DEMO_BANNER}\nopening turn`;
  assert.equal(wordCount(text), 2);
});

test("shared prompt for the next slot contains the previous turn", () => {
  const drill = session({ slotC: true });
  const first = adjudicate({
    session: drill,
    transcript: [],
    cursor: { round: 1, slot: "A" },
    text: demoTurnText({ round: 1, slot: "A", previousName: "" }),
    source: "demo",
  });
  const prompt = buildUserPrompt(drill, first.transcript, first.cursor);
  assert.match(prompt, /Slot B/);
  assert.match(prompt, /Grok/);
  assert.match(prompt, /SHARED STATE/);
  assert.match(prompt, /opening turn/);
});

test("provider requests use the documented endpoints and keep the secret out of the URL", async () => {
  const token = "github_pat_testtokenvalue";
  const github = githubRequest({
    key: token,
    model: "openai/gpt-4o-mini",
    system: "role",
    prompt: "turn",
  });
  assert.equal(github.url, "https://models.github.ai/inference/chat/completions");
  assert.equal(github.url.includes(token), false);
  assert.equal(github.init.headers.Authorization, `Bearer ${token}`);
  assert.equal(github.init.headers["X-GitHub-Api-Version"], "2022-11-28");
  const body = JSON.parse(github.init.body);
  assert.equal(body.model, "openai/gpt-4o-mini");
  assert.equal(body.messages[0].role, "system");
  assert.equal(body.stream, false);

  const xai = xaiRequest({ key: "xai-test-key", model: "grok-4.7", system: "s", prompt: "p" });
  assert.equal(xai.url, "https://api.x.ai/v1/chat/completions");
  assert.equal(xai.url.includes("xai-test-key"), false);
  assert.equal(JSON.parse(xai.init.body).model, "grok-4.7");

  const gemini = geminiRequest({
    key: "AIza-test-key",
    model: "gemini-3.8-flash",
    system: "s",
    prompt: "p",
  });
  assert.equal(gemini.url.includes("AIza-test-key"), false);
  assert.match(gemini.url, /models\/gemini-3\.8-flash:generateContent$/);
  assert.equal(gemini.init.headers["x-goog-api-key"], "AIza-test-key");

  let calls = 0;
  await assert.rejects(
    () => completeTurn({
      slot: "C",
      session: session({ slotC: true, mode: "live" }),
      transcript: [],
      cursor: { round: 1, slot: "C" },
      key: "  ",
      fetcher: () => {
        calls += 1;
        return Promise.resolve();
      },
    }),
    (err) => err.code === "missing-key" && /models:read/.test(err.message),
  );
  assert.equal(calls, 0);
});

test("live errors name auth, rate limit, retirement, and CORS without echoing the token", async () => {
  const token = "github_pat_supersecretvalue";
  const agent = session({ slotC: true }).agents.C;
  const auth = failureFromStatus(agent, 401, `bad ${token}`, { error: { message: `nope ${token}` } }, token);
  assert.equal(auth.code, "auth");
  assert.match(auth.message, /models:read/);
  assert.equal(auth.message.includes(token), false);
  assert.match(auth.message, /\[redacted\]/);

  const rate = failureFromStatus(agent, 429, "", null, token);
  assert.equal(rate.code, "rate-limit");
  assert.match(rate.message, /429/);

  const retired = failureFromStatus(agent, 410, "", null, token);
  assert.equal(retired.code, "retired");
  assert.match(retired.message, /July 30, 2026/);

  const blocked = networkFailure(agent, new TypeError(`Failed to fetch ${token}`), token);
  assert.equal(blocked.code, "network");
  assert.match(blocked.message, /CORS/);
  assert.match(blocked.message, /July 30, 2026/);
  assert.equal(blocked.message.includes(token), false);

  const drill = session({ slotC: true, mode: "live" });
  const seen = [];
  const text = await completeTurn({
    slot: "C",
    session: drill,
    transcript: [],
    cursor: { round: 1, slot: "C" },
    key: token,
    fetcher: async (url, init) => {
      seen.push({ url, authorization: init.headers.Authorization, body: init.body });
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            choices: [{ message: { content: "opening turn\nHEADING: shared landing continuity\nRISK: none" } }],
          });
        },
      };
    },
  });
  assert.match(text, /HEADING:/);
  assert.equal(seen[0].url, "https://models.github.ai/inference/chat/completions");
  assert.equal(seen[0].authorization, `Bearer ${token}`);
  assert.equal(seen[0].url.includes(token), false);
  assert.equal(JSON.parse(seen[0].body).model, "openai/gpt-4o-mini");
});

test("the oracle proxy is the public live call and carries no key", async () => {
  assert.equal(PROXY_BASE, "https://baileyos-app.vercel.app");
  const drill = session({ mode: "live", slotC: true });
  const seen = [];
  const reply = "opening turn\nHEADING: shared landing continuity\nRISK: proxy";
  for (const slot of ["A", "B", "C"]) {
    const text = await completeProxyTurn({
      slot,
      session: drill,
      transcript: [],
      cursor: { round: 1, slot },
      fetcher: async (url, init) => {
        seen.push({ url, init });
        return {
          ok: true,
          status: 200,
          headers: { get: () => "" },
          async text() {
            return JSON.stringify({ text: reply });
          },
        };
      },
    });
    assert.equal(text, reply);
  }
  assert.deepEqual(seen.map((call) => JSON.parse(call.init.body).provider), ["grok", "gemini", "github"]);
  for (const call of seen) {
    assert.equal(call.url, "https://baileyos-app.vercel.app/api/oracle");
    assert.equal(call.init.headers.Authorization, undefined);
    assert.equal(JSON.stringify(call.init).includes("github_pat"), false);
    const body = JSON.parse(call.init.body);
    assert.ok(body.model);
    assert.equal(typeof body.system, "string");
    assert.equal(body.messages[0].role, "user");
    assert.match(body.messages[0].content, /SHARED STATE/);
  }
  const spec = proxyRequest({
    provider: "grok",
    model: "grok-4.7",
    system: "role",
    messages: [{ role: "user", content: "turn" }],
  });
  assert.equal(spec.url, PROXY_BASE + "/api/oracle");
});

test("a proxy 429 pauses with a rate-limit error and records no turn", async () => {
  const drill = session({ slotC: true });
  await assert.rejects(
    () => completeProxyTurn({
      slot: "A",
      session: drill,
      transcript: [],
      cursor: { round: 1, slot: "A" },
      fetcher: async () => ({
        ok: false,
        status: 429,
        headers: { get: (name) => (name.toLowerCase() === "retry-after" ? "12" : "") },
        async text() {
          return JSON.stringify({ error: "slow down" });
        },
      }),
    }),
    (err) => err instanceof ProviderFailure
      && err.code === "rate-limit"
      && /paused/i.test(err.message)
      && /12/.test(err.message)
      && /oracle proxy/i.test(err.message),
  );
  const direct = failureFromStatus(drill.agents.A, 429, "", null, "");
  assert.equal(direct.code, "rate-limit");
  assert.match(direct.message, /paused/i);

  const parsed = await readProxyResponse("B", drill.agents.B, {
    ok: true,
    status: 200,
    headers: { get: () => "" },
    async text() {
      return "plain reply";
    },
  });
  assert.equal(parsed, "plain reply");
});

test("export records the active slots and does not carry a token", async () => {
  const token = "github_pat_shouldneverexport";
  const drill = session({ slotC: true });
  const transcript = await playDrill(drill, async ({ cursor, previousName }) => {
    return demoTurnText({ round: cursor.round, slot: cursor.slot, previousName });
  });
  const doc = transcriptDocument(drill, transcript, "2026-11-13T00:00:00.000Z");
  const encoded = JSON.stringify(doc);
  assert.equal(encoded.includes(token), false);
  assert.equal(encoded.includes("apiKey"), false);
  assert.equal(encoded.includes("localStorage"), false);
  assert.deepEqual(doc.activeSlots, ["A", "B", "C"]);
  assert.equal(doc.agents.find((agent) => agent.slot === "C").included, true);
  assert.equal(doc.agents.find((agent) => agent.slot === "C").model, "openai/gpt-4o-mini");
  const text = transcriptText(drill, transcript);
  assert.match(text, /Slot C GitHub Models/);
  assert.match(text, /FLAG/);
  assert.equal(text.includes(token), false);

  const two = transcriptDocument(session(), [], "2026-11-13T00:00:00.000Z");
  assert.deepEqual(two.activeSlots, ["A", "B"]);
  assert.equal(two.agents.find((agent) => agent.slot === "C").included, false);
});
