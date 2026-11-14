import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('Python Queen wiring: stale feed is never consensus, and deleting linkage keeps the chain', () => {
  const py = spawnSync('python3', ['-m', 'unittest', 'validation.test_consensus', 'validation.test_validate_corridor', 'validation.test_slots'], { encoding: 'utf8' });
  assert.equal(py.status, 0, py.stderr || py.stdout);
});
