import assert from 'node:assert/strict';
import test from 'node:test';
import { votersToCall } from './liveVoters';
import { loadSlotConfig } from '@/lib/landing-stone/slots';

test('only enabled slots with a key and a wired provider are called', () => {
  const slots = loadSlotConfig().slots;
  const none = votersToCall(slots, {});
  assert.deepEqual(none.map((slot) => slot.id), []);
  const gemini = votersToCall(slots, { GEMINI_API_KEY: 'present', GITHUB_MODELS_TOKEN: 'present' });
  assert.deepEqual(gemini.map((slot) => slot.id), ['B', 'C']);
  const paid = votersToCall(slots.map((slot) => slot.id === 'D' ? { ...slot, enabled: true } : slot), { MOONSHOT_API_KEY: 'present', GEMINI_API_KEY: 'present' });
  assert.equal(paid.some((slot) => slot.id === 'D'), false);
  assert.equal(JSON.stringify(paid).includes('present'), false);
});
