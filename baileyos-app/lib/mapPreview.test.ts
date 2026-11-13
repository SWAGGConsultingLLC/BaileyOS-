import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { MAP_DESCRIPTION, MAP_TITLE, mapOrigin, mapSocialMetadata } from './mapPreview.ts';

test('the map preview describes the business in plain words', () => {
  assert.ok(MAP_DESCRIPTION.length >= 120 && MAP_DESCRIPTION.length <= 200);
  assert.equal(MAP_DESCRIPTION, mapSocialMetadata({ path: '/' }).description);
  assert.match(MAP_DESCRIPTION, /SWAGG Consulting/);
  assert.match(MAP_DESCRIPTION, /BaileyOS/);
  assert.match(MAP_DESCRIPTION, /Question #001/);
  assert.match(MAP_DESCRIPTION, /360° Brewing/);
  assert.match(MAP_DESCRIPTION, /your neighborhood/);
  assert.equal(/three phones/i.test(MAP_DESCRIPTION), false);
  assert.equal(MAP_DESCRIPTION.includes('81ABSCS81'), false);
  assert.equal(/steward/i.test(MAP_DESCRIPTION), false);
  assert.equal(MAP_TITLE.includes('81ABSCS81'), false);
});

test('the preview image and page address follow the host that served the page', () => {
  const custom = mapSocialMetadata({ host: '360degreebrewing.swaggconsulting.com', path: '/' });
  const og = custom.openGraph;
  assert.equal(og && 'url' in og ? og.url : '', 'https://360degreebrewing.swaggconsulting.com/');
  const image = og && 'images' in og && Array.isArray(og.images) ? og.images[0] : null;
  assert.equal(image && typeof image === 'object' && 'url' in image ? image.url : '', 'https://360degreebrewing.swaggconsulting.com/brew/question-001.png?v=2');
  assert.equal(image && typeof image === 'object' && 'width' in image ? image.width : 0, 1200);
  assert.equal(image && typeof image === 'object' && 'height' in image ? image.height : 0, 627);
  const vercel = mapSocialMetadata({ host: 'BaileyOS-App.vercel.app:443', path: '/suite' });
  assert.equal(vercel.openGraph && 'url' in vercel.openGraph ? vercel.openGraph.url : '', 'https://baileyos-app.vercel.app/suite');
  assert.equal(mapOrigin('evil.example'), 'https://baileyos-app.vercel.app');
  assert.equal(custom.twitter?.card, 'summary_large_image');
  const question = readFileSync(new URL('../app/brew/q/001/page.tsx', import.meta.url), 'utf8');
  assert.match(question, /https:\/\/baileyos-app\.vercel\.app\/brew\/q\/001/);
});
