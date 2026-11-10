import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { MISSION_BODY, MISSION_TITLE, QUESTION_DESCRIPTION, QUESTION_IMAGE, QUESTION_PROMPT, QUESTION_TITLE, VOTE_OPTIONS, brewReturnPath, publicTally, voteOption } from './question001.ts';
import { publicVoteRow, voteReceipt } from './receipt.ts';

const SUBJECT = '11111111-1111-4111-8111-111111111111';

test('question text is the approved wording', () => {
  assert.equal(QUESTION_TITLE, '360° Brewing | Question #001');
  assert.equal(QUESTION_DESCRIPTION, 'One verified person, one vote. Results counted in the open. Sign in with LinkedIn and add your voice to Question #001.');
  assert.ok(QUESTION_DESCRIPTION.length >= 100);
  assert.equal(MISSION_TITLE, '360° Brewing: Our Mission');
  assert.match(MISSION_BODY, /We're reconnecting people from LinkedIn/);
  assert.match(QUESTION_PROMPT, /outside auditors/);
  assert.deepEqual(VOTE_OPTIONS.map(item => item.label), [
    'Outside review required first',
    'Steward release with a permanent public log',
    'Abstain, record my presence only',
  ]);
  assert.equal(voteOption('A'), 'A');
  assert.equal(voteOption('D'), null);
  assert.equal(brewReturnPath('/brew/q/001/vote'), '/brew/q/001/vote');
  assert.equal(brewReturnPath('/?checkin=1'), '/?checkin=1');
  assert.equal(brewReturnPath('/suite'), null);
});

test('public results are counts only', () => {
  const tally = publicTally({ A: 1, B: 1, C: 0 });
  assert.equal(tally.total, 2);
  assert.equal(tally.options[0].percent, 50);
  assert.equal(publicTally({ A: 0, B: 0, C: 0 }).options[0].percent, 0);
  const text = JSON.stringify(tally);
  assert.doesNotMatch(text, /subject|email|name|provider_sub|user_id/);
});

test('a receipt hides the subject and stays stable', () => {
  const salt = 'server-salt-not-for-the-page';
  const row = publicVoteRow({ at: '2026-11-10T02:09:00Z', option: 'A', subjectId: SUBJECT }, salt);
  assert.equal(row.receipt, voteReceipt(salt, SUBJECT));
  assert.equal(JSON.stringify(row).includes(SUBJECT), false);
  assert.equal(JSON.stringify(row).includes(salt), false);
  assert.notEqual(voteReceipt(salt, SUBJECT), voteReceipt('other-salt', SUBJECT));
});

test('the share page names the image and the open graph title', () => {
  const page = readFileSync(new URL('../../app/brew/q/001/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /QUESTION_TITLE/);
  assert.match(page, /QUESTION_DESCRIPTION/);
  assert.match(page, /QUESTION_IMAGE/);
  assert.equal(QUESTION_IMAGE, 'https://baileyos-app.vercel.app/brew/question-001.png?v=2');
  const png = readFileSync(new URL('../../public/brew/question-001.png', import.meta.url));
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 627);
});

test('brew pages link back to the map and the vote log is not cached', () => {
  const link = readFileSync(new URL('../../components/BackToMap.tsx', import.meta.url), 'utf8');
  assert.match(link, /Back to map/);
  assert.match(link, /https:\/\/baileyos-app\.vercel\.app\//);
  const pages = ['mission/page.tsx', 'q/001/page.tsx', 'q/001/vote/page.tsx', 'q/001/verify/page.tsx'];
  for (const page of pages) {
    const src = readFileSync(new URL(`../../app/brew/${page}`, import.meta.url), 'utf8');
    assert.match(src, /BackToMap/);
  }
  const log = readFileSync(new URL('../../app/brew/q/001/verify/page.tsx', import.meta.url), 'utf8');
  assert.match(log, /Back to the question/);
  assert.match(log, /force-dynamic/);
  assert.match(log, /readVerification/);
  const route = readFileSync(new URL('../../app/api/brew/q/001/verify/route.ts', import.meta.url), 'utf8');
  const results = readFileSync(new URL('../../app/api/brew/q/001/results/route.ts', import.meta.url), 'utf8');
  assert.match(route, /no-store/);
  assert.match(results, /no-store/);
});

test('email and signed-out visitors are sent to LinkedIn before a vote', () => {
  const page = readFileSync(new URL('../../app/brew/q/001/vote/page.tsx', import.meta.url), 'utf8');
  const messageAt = page.indexOf('{LINKEDIN_VOTE}');
  const choicesAt = page.indexOf('VOTE_OPTIONS.map');
  assert.match(page, /Voting needs a LinkedIn sign-in/);
  assert.ok(messageAt > 0 && choicesAt > messageAt);
  assert.match(page, /needsLinkedIn \? \(/);
  assert.match(page, /QUESTION_VOTE_PATH/);
  assert.match(page, /role=\{notice \? 'alert' : 'status'\}/);
  assert.match(page, /text-lg font-semibold/);
  const route = readFileSync(new URL('../../app/api/brew/q/001/vote/route.ts', import.meta.url), 'utf8');
  assert.match(route, /subjectIsVerified/);
  assert.doesNotMatch(route, /user_metadata|email ===/);
});

test('the vote route and the vote table reject changes', () => {
  const route = readFileSync(new URL('../../app/api/brew/q/001/vote/route.ts', import.meta.url), 'utf8');
  const store = readFileSync(new URL('./store.ts', import.meta.url), 'utf8');
  const sql = readFileSync(new URL('../../supabase/migrations/20261110024600_consensus_question_001.sql', import.meta.url), 'utf8');
  assert.match(route, /subjectIsVerified/);
  assert.match(route, /decideSuiteSubject/);
  assert.match(store, /verified_suite_subjects/);
  assert.match(sql, /unique \(question_id, subject_id\)/);
  assert.match(sql, /consensus votes are append-only/);
  assert.match(sql, /before update/);
  assert.match(sql, /before delete/);
  assert.doesNotMatch(route, /user_metadata|email ===/);
});
