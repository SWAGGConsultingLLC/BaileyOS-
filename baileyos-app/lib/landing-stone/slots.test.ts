import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { loadSlotConfig, slotViews } from './slots';

test('free slots are listed before paid slots and a missing key is not configured', () => {
  const config = loadSlotConfig();
  const views = slotViews(config.slots, {});
  const tiers = views.map((slot) => slot.tier);
  const paidAt = tiers.indexOf('paid');
  assert.ok(paidAt > 0);
  assert.ok(tiers.slice(0, paidAt).every((tier) => tier === 'free'));
  assert.deepEqual(views.map((slot) => slot.name), ['Grok', 'Gemini', 'GitHub Models', 'Kimi', 'Claude']);
  const kimi = views.find((slot) => slot.name === 'Kimi');
  const claude = views.find((slot) => slot.name === 'Claude');
  assert.equal(kimi?.status, 'disabled');
  assert.equal(claude?.status, 'disabled');
  assert.equal(views.find((slot) => slot.name === 'Grok')?.status, 'not configured');
  const enabled = slotViews(config.slots.map((slot) => slot.name === 'Kimi' ? { ...slot, enabled: true } : slot), {});
  assert.equal(enabled.find((slot) => slot.name === 'Kimi')?.status, 'not configured');
  const ready = slotViews(config.slots.map((slot) => slot.name === 'Kimi' ? { ...slot, enabled: true } : slot), { MOONSHOT_API_KEY: 'secret-value' });
  const row = ready.find((slot) => slot.name === 'Kimi');
  assert.equal(row?.status, 'ready');
  assert.equal(JSON.stringify(ready).includes('secret-value'), false);
});

test('the server registry matches the simulation registry', () => {
  const app = fs.readFileSync(path.join(process.cwd(), 'validation', 'voter_slots.json'), 'utf8');
  const sim = fs.readFileSync(path.join(process.cwd(), '..', 'landing-stone', 'simulation', 'slots.json'), 'utf8');
  assert.equal(app, sim);
  const shared = fs.readFileSync(path.join(process.cwd(), 'validation', 'shared_document.json'), 'utf8');
  const simDoc = fs.readFileSync(path.join(process.cwd(), '..', 'landing-stone', 'simulation', 'shared-document.json'), 'utf8');
  assert.equal(shared, simDoc);
});
