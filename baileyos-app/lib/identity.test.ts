import assert from 'node:assert/strict';
import { test } from 'node:test';
import { linkedInPresentation, visibleIdentity } from './identity.ts';

test('a LinkedIn name and picture are kept and ids are dropped', () => {
  const shown = linkedInPresentation({
    name: 'Brian',
    picture: 'https://media.licdn.com/photo.jpg',
    email: 'person@example.test',
    sub: '0RuziWBvEA',
  });
  assert.deepEqual(shown, { name: 'Brian', picture: 'https://media.licdn.com/photo.jpg' });
  assert.equal(linkedInPresentation({ name: 'f6b66ede-f38a-4d6e-984f-0139076f789a' }).name, null);
  assert.equal(linkedInPresentation({ name: 'person@example.test' }).name, null);
  assert.equal(linkedInPresentation({ picture: 'http://example.test/a.jpg' }).picture, null);
});

test('the person can hide the name or the photo', () => {
  const linkedIn = { name: 'Brian', picture: 'https://media.licdn.com/photo.jpg' };
  assert.deepEqual(visibleIdentity(linkedIn, null), linkedIn);
  assert.deepEqual(visibleIdentity(linkedIn, { displayName: 'Steward', showName: true, showPhoto: false }), {
    name: 'Steward',
    picture: null,
  });
  assert.deepEqual(visibleIdentity(linkedIn, { displayName: 'Steward', showName: false, showPhoto: true }), {
    name: null,
    picture: linkedIn.picture,
  });
});
