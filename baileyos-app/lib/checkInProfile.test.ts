import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { checkInCard, publicCheckInCard, shouldAttachCheckInProfile } from './checkInProfile.ts';

const linkedIn = {
  name: 'Ada Lovelace',
  given_name: 'Ada',
  family_name: 'Lovelace',
  picture: 'https://media.licdn.com/dms/image/photo.jpg',
  email: 'ada@example.test',
  email_verified: true,
  sub: '0RuziWBvEA',
  provider_id: '0RuziWBvEA',
  iss: 'https://www.linkedin.com/oauth',
  locale: 'en-US',
};

test('LinkedIn sign-in gives a name and photo and no profile link', () => {
  const card = checkInCard(linkedIn);
  assert.deepEqual(card, {
    name: 'Ada Lovelace',
    photo: 'https://media.licdn.com/dms/image/photo.jpg',
    profileUrl: null,
  });
  const text = JSON.stringify(card);
  assert.equal(text.includes('ada@example.test'), false);
  assert.equal(text.includes('0RuziWBvEA'), false);
  assert.equal(text.includes('linkedin.com/in/'), false);
});

test('a profile link is kept only when LinkedIn already sent one', () => {
  const card = checkInCard({ ...linkedIn, profile_url: 'https://www.linkedin.com/in/ada' });
  assert.equal(card?.profileUrl, 'https://www.linkedin.com/in/ada');
  assert.equal(checkInCard({ ...linkedIn, profile_url: 'http://www.linkedin.com/in/ada' })?.profileUrl, null);
});

test('the choice is off unless the person turns it on', () => {
  const card = checkInCard(linkedIn);
  assert.equal(shouldAttachCheckInProfile({ showLinkedIn: false, verified: true, card }), false);
  assert.equal(shouldAttachCheckInProfile({ showLinkedIn: true, verified: false, card }), false);
  assert.equal(shouldAttachCheckInProfile({ showLinkedIn: true, verified: true, card: null }), false);
  assert.equal(shouldAttachCheckInProfile({ showLinkedIn: true, verified: true, card }), true);
  assert.deepEqual(publicCheckInCard(card), card);
  const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /useState\(false\)/);
  assert.match(page, /Show my LinkedIn profile with my check-in/);
});
