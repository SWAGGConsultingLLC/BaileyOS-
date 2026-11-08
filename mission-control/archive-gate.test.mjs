import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const code = readFileSync(new URL('./archive-gate.js', import.meta.url), 'utf8');
const context = { console, Date, crypto: globalThis.crypto };
context.globalThis = context;
vm.runInNewContext(code, context);
const Gate = context.ArchiveGate;
const now = 1_700_000_000_000;

test('a future yes is remembered and a no, expired yes, or garbage is not', () => {
  assert.equal(Gate.rememberedYes({ state: 'yes', expires: now + 1000 }, now), true);
  assert.equal(Gate.rememberedYes({ state: 'yes', expires: now }, now), false);
  assert.equal(Gate.rememberedYes({ state: 'no', expires: now + 1000 }, now), false);
  assert.equal(Gate.rememberedYes({ state: 'yes' }, now), false);
  assert.equal(Gate.rememberedYes(null, now), false);
});

test('storage errors do not throw and do not count as a yes', () => {
  const storage = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('denied'); },
  };
  assert.equal(Gate.readRaw(storage), null);
  assert.equal(Gate.writeRecord(storage, Gate.record('yes', now)), false);
  assert.equal(Gate.rememberedYes(Gate.readRaw(storage), now), false);
});

test('a log body is the archive issuer and has no identity fields', () => {
  const token = Gate.newToken(crypto);
  const body = Gate.payload('yes', '/mission-control/living-archive.html', now, token);
  assert.equal(body.issuer_id, 'bailey-archive');
  assert.equal(body.verified, true);
  assert.equal(body.event, 'yes');
  assert.equal(body.content_category, 'general');
  assert.equal(body.token_hash, token);
  assert.equal(body.token_hash.length, 32);
  assert.equal(body.source_id, '/mission-control/living-archive.html');
  for (const key of ['user', 'user_id', 'asserter', 'birthdate', 'age', 'email', 'name']) {
    assert.equal(Object.hasOwn(body, key), false);
  }
  assert.equal(Gate.payload('shown', '/x', now, token).verified, false);
  assert.throws(() => Gate.payload('passport', '/x', now, token));
});

test('the page wires the gate and does not treat a query string as proof', () => {
  const html = readFileSync(new URL('./living-archive.html', import.meta.url), 'utf8');
  assert.match(html, /id="archive-age-gate"/);
  assert.match(html, /ArchiveGate\.boot\(/);
  assert.match(html, /bailey_agegate/);
  assert.doesNotMatch(html, /searchParams\.get\(['"]age/);
  assert.doesNotMatch(html, /document\.referrer/);
  assert.match(html, /Self-check, not an age or identity verification|self-check, not an age or identity verification/i);
});
