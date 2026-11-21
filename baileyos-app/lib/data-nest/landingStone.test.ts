import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.join(process.cwd(), '..');
const app = process.cwd();

test('the sequencer migration is new and locks the chain', () => {
  const older = fs.readFileSync(path.join(app, 'supabase/migrations/20261114020000_ruling_records.sql'), 'utf8');
  const next = fs.readFileSync(path.join(app, 'supabase/migrations/20261114043000_ruling_sequencer.sql'), 'utf8');
  assert.equal(older.includes('append_ruling_record'), false);
  assert.equal(older.includes('sequence_number'), false);
  assert.match(next, /pg_advisory_xact_lock/);
  assert.match(next, /ruling_records_prev_unique/);
  assert.match(next, /ruling_records_sequence_unique/);
  assert.match(next, /ruling_records_one_genesis/);
  assert.match(next, /GENESIS/);
  assert.match(next, /chain head moved/);
  assert.match(next, /for update/);
  const epoch = fs.readFileSync(path.join(app, 'supabase/migrations/20261114051000_ruling_epoch_idempotency.sql'), 'utf8');
  assert.match(epoch, /idempotency_key/);
  assert.match(epoch, /chain_epoch/);
  assert.match(epoch, /idempotency key reused/);
});

test('the Landing Stone page starts pending and the two copies match', () => {
  const repo = fs.readFileSync(path.join(root, 'landing-stone/index.html'), 'utf8');
  const served = fs.readFileSync(path.join(app, 'public/landing-stone/index.html'), 'utf8');
  assert.equal(repo, served);
  for (const banned of ['97%', 'TARGET LOCKED', 'Grak', 'STABLE ACROSS', 'LOCKED']) {
    assert.equal(repo.includes(banned), false, banned);
  }
  assert.match(repo, /Consensus/);
  assert.match(repo, /Feed Health/);
  assert.match(repo, /Chain Integrity/);
  assert.match(repo, /id="lock">PENDING/);
  assert.match(repo, /\/api\/data-nest\/continuity/);
  assert.match(repo, /\/landing-stone\/prototype/);
});

test('the prototype gathers the live record and does not invent a clearance', () => {
  const repo = fs.readFileSync(path.join(root, 'landing-stone/prototype/index.html'), 'utf8');
  const served = fs.readFileSync(path.join(app, 'public/landing-stone/prototype.html'), 'utf8');
  assert.equal(repo, served);
  assert.match(repo, /The lights inform\. The steward decides\./);
  assert.match(repo, /Every fold carries the fingerprint of the one before it\. Reality remembers\./);
  assert.match(repo, /Personal context stays on this device/);
  assert.match(repo, /\/landing-stone/);
  assert.match(repo, /\/data-nest/);
  assert.match(repo, /\/api\/data-nest\/continuity/);
  assert.match(repo, /\/api\/landing-stone\/slots/);
  assert.match(repo, /\/api\/data-nest\/validate/);
  assert.match(repo, /National Weather Service/);
  assert.match(repo, /USGS/);
  assert.match(repo, /CoTrip/);
  assert.match(repo, /QUORUM INCOMPLETE/);
  assert.equal(repo.toLowerCase().includes('proof'), false);
  assert.equal(/\bSAFE\b/.test(repo), false);
  assert.match(served, /not an all-clear/);
});
