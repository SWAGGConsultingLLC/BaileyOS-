import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('the public map header does not show the steward mark and links to Question #001', () => {
  const src = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.equal(src.includes('81ABSCS81'), false);
  assert.equal(src.includes('⊞'), false);
  assert.equal(src.includes('The bearing stays'), false);
  assert.match(src, /SWAGG Consulting/);
  assert.match(src, /Answer Question #001/);
  assert.match(src, /href="\/brew\/q\/001"/);
  assert.match(src, /Nothing is saved until you tap Share my place/);
  assert.match(src, /Continue without signing in/);
  assert.match(src, /CHECKIN_RETURN/);
  assert.match(src, /useState\(false\)/);
});
