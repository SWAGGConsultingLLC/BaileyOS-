import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  EXAMPLE_PROFILES,
  generationLine,
  sectionRank,
  shownGeneration,
  stripProfile,
} from './profile.ts';

test('generation labels follow the named years, with the Xennial line called out', () => {
  assert.equal(generationLine(1945), '1945: Silent');
  assert.equal(generationLine(1946), '1946: Boomer');
  assert.equal(generationLine(1948), '1948: Boomer');
  assert.equal(generationLine(1964), '1964: Boomer');
  assert.equal(generationLine(1965), '1965: Gen X');
  assert.equal(generationLine(1976), '1976: Gen X');
  assert.equal(generationLine(1977), '1977: Xennial (Gen X and Millennial line)');
  assert.equal(generationLine(1980), '1980: Xennial (Gen X and Millennial line)');
  assert.equal(generationLine(1981), '1981: Xennial (Gen X and Millennial line)');
  assert.equal(generationLine(1983), '1983: Xennial (Gen X and Millennial line)');
  assert.equal(generationLine(1984), '1984: Millennial');
  assert.equal(generationLine(1994), '1994: Millennial');
  assert.equal(generationLine(1995), '1995: Millennial (Millennial and Gen Z line)');
  assert.equal(generationLine(1996), '1996: Millennial (Millennial and Gen Z line)');
  assert.equal(generationLine(1997), '1997: Gen Z (Millennial and Gen Z line)');
  assert.equal(generationLine(1998), '1998: Gen Z (Millennial and Gen Z line)');
  assert.equal(generationLine(1999), '1999: Gen Z');
  assert.equal(generationLine(2012), '2012: Gen Z');
  assert.equal(generationLine(2013), '2013: Gen Alpha');
  assert.equal(generationLine(1976.5), null);
});

test('a self-identified label replaces the year label', () => {
  assert.equal(shownGeneration({ birthYear: 1997, selfLabel: '' }), '1997: Gen Z (Millennial and Gen Z line)');
  assert.equal(shownGeneration({ birthYear: 1997, selfLabel: 'Older millennial' }), 'Older millennial');
});

test('selected interests sort ahead of the others', () => {
  const selected = ['weather', 'roads'] as const;
  assert.ok(sectionRank('weather', selected) < sectionRank('chain', selected));
  assert.ok(sectionRank('chain', selected) < sectionRank('quake', selected));
});

test('a request body cannot carry birth year, origin, or interests', () => {
  const body = stripProfile({
    lat: 39.06,
    lon: -108.55,
    radiusKm: 80,
    birthYear: 1981,
    origin: 'Western Colorado',
    selfLabel: 'Older millennial',
    interests: ['roads', 'weather', 'safety'],
    profile: { birthYear: 1948, origin: 'Central Illinois', interests: ['veterans'] },
    messages: [{ role: 'user', content: 'What is the weather?' }],
  });
  const text = JSON.stringify(body);
  assert.equal(text.includes('birthYear'), false);
  assert.equal(text.includes('origin'), false);
  assert.equal(text.includes('interests'), false);
  assert.equal(text.includes('1981'), false);
  assert.equal(text.includes('1948'), false);
  assert.equal(text.includes('Western Colorado'), false);
  assert.equal(text.includes('Older millennial'), false);
  assert.equal(text.includes('selfLabel'), false);
  assert.equal(text.includes('Central Illinois'), false);
  assert.equal(text.includes('veterans'), false);
  assert.match(text, /39\.06/);
  assert.match(text, /What is the weather/);
});

test('example profiles do not include a location fix', () => {
  for (const example of EXAMPLE_PROFILES) {
    const text = JSON.stringify(example.profile);
    assert.equal(text.includes('lat'), false);
    assert.equal(text.includes('lon'), false);
  }
  assert.equal(EXAMPLE_PROFILES[0].profile.birthYear, 1981);
  assert.equal(EXAMPLE_PROFILES[1].profile.birthYear, 1948);
});

test('Data Nest server routes never mention the personal profile', () => {
  const root = new URL('../../app/api/data-nest/', import.meta.url);
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.ts')) files.push(path);
    }
  };
  walk(root.pathname);
  assert.ok(files.length > 0);
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    assert.equal(/birthYear|homeRegion|nestProfile|Western Colorado|Central Illinois/.test(src), false, file);
  }
  const app = readFileSync(new URL('../../components/data-nest/DataNestApp.tsx', import.meta.url), 'utf8');
  assert.match(app, /stripProfile\(body\)/);
});
