import assert from 'node:assert/strict';
import test from 'node:test';
import { isAmber, isSilver, roadKind } from './liveFeeds.ts';

test('AMBER is only the NWS child-abduction event', () => {
  assert.equal(isAmber('Child Abduction Emergency'), true);
  assert.equal(isAmber('Winter Weather Advisory'), false);
});

test('Silver needs the alert text, not every local emergency', () => {
  assert.equal(isSilver('Local Area Emergency', 'Silver Alert', ''), true);
  assert.equal(isSilver('Local Area Emergency', 'Wind advisory', 'gusts'), false);
  assert.equal(isSilver('Child Abduction Emergency', 'Silver Alert', ''), false);
});

test('road text is classified without inventing an event', () => {
  assert.equal(roadKind('Chain law in effect'), 'chain');
  assert.equal(roadKind('Full closure'), 'closure');
  assert.equal(roadKind('Crash on I-70'), 'crash');
  assert.equal(roadKind('Scheduled work'), 'other');
});
