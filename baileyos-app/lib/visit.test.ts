import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseVisitCategory } from './visit.ts';

test('visit categories are logged-out, logged-in, or blocked, and nothing else', () => {
  assert.equal(parseVisitCategory('logged_out_visitor'), 'logged_out_visitor');
  assert.equal(parseVisitCategory('logged_in'), 'logged_in');
  assert.equal(parseVisitCategory('blocked'), 'blocked');
  assert.equal(parseVisitCategory('admin'), null);
  assert.equal(parseVisitCategory({ ip: '1.2.3.4' }), null);
  const route = readFileSync(new URL('../app/api/visit/route.ts', import.meta.url), 'utf8');
  assert.match(route, /visit_events/);
  assert.match(route, /insert\(\{ category \}\)/);
});
