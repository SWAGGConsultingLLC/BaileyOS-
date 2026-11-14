import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('Python Queen wiring: stale feed is never consensus, and deleting linkage keeps the chain', () => {
  const py = spawnSync('python3', ['-m', 'unittest',
    'validation.test_consensus.QueenTests.test_seven_of_seven_then_stale_feed_is_never_consensus',
    'validation.test_consensus.QueenTests.test_deleting_linkage_does_not_break_the_chain',
    'validation.test_consensus.QueenTests.test_anchor_is_not_published',
  ], { encoding: 'utf8' });
  assert.equal(py.status, 0, py.stderr || py.stdout);
});
