import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { getResolution } from 'h3-js';
import { publicMapBody } from './crowd.ts';
import { hexesCovering, jitterInHex, legacyNeighborhoodHex, neighborhoodHex } from './neighborhood.ts';

const HEX = neighborhoodHex(38.9072, -77.0369);

test('the public count is signed-in people and an anonymous pin has no name', () => {
  const empty = publicMapBody({ people: 0, neighborhoods: [], zoom_in: false });
  assert.equal(empty.people, 0);
  assert.equal(empty.neighborhoods.length, 0);
  const shown = publicMapBody({
    people: 4,
    neighborhoods: [{
      hex: HEX,
      pins: [
        { name: 'Ada Lovelace', photo: 'https://media.licdn.com/photo.jpg', profileUrl: null },
        { name: null, photo: 'https://media.licdn.com/hidden.jpg', profileUrl: 'https://example.com/secret' },
      ],
    }],
    zoom_in: false,
  });
  assert.equal(shown.people, 4);
  assert.equal(shown.neighborhoods.length, 1);
  assert.equal(shown.neighborhoods[0].pins[0].name, 'Ada Lovelace');
  assert.equal(shown.neighborhoods[0].pins[1].name, null);
  assert.equal(shown.neighborhoods[0].pins[1].photo, null);
  assert.equal(shown.neighborhoods[0].pins[1].profileUrl, null);
  assert.equal('phones' in shown, false);
});

test('a neighborhood with no pins is not returned, and markers stay off the response', () => {
  const hidden = publicMapBody({
    people: 2,
    neighborhoods: [{ hex: HEX, pins: [] }, { hex: 'bad', pins: [{ name: 'Ada', photo: null, profileUrl: null }] }],
    zoom_in: false,
  });
  assert.equal(hidden.people, 2);
  assert.equal(hidden.neighborhoods.length, 0);
  const shown = publicMapBody({
    people: 1,
    neighborhoods: [{ hex: HEX, pins: [{ name: 'Ada Lovelace', photo: null, profileUrl: null, subjectId: 'secret-subject' }] }],
    zoom_in: false,
  });
  const text = JSON.stringify(shown);
  assert.equal(text.includes('phoneKey'), false);
  assert.equal(text.includes('secret-subject'), false);
  assert.equal(text.includes('lat'), false);
  assert.equal(text.includes('lon'), false);
  assert.equal(text.includes('band_km'), false);
  const route = readFileSync(new URL('../app/api/placements/route.ts', import.meta.url), 'utf8');
  assert.match(route, /mapPlacements/);
  assert.match(route, /checkin_live_tallies/);
  assert.match(route, /no-store/);
  assert.equal(route.includes('band_km'), false);
  assert.equal(route.includes('phone_key'), false);
  assert.equal(route.includes('public_map_checkins'), false);
});

test('neighborhoods are resolution 7 and a jittered dot stays inside the hex', () => {
  assert.equal(getResolution(HEX), 7);
  assert.equal(getResolution(legacyNeighborhoodHex(0, 0)), 7);
  assert.notEqual(legacyNeighborhoodHex(0, 0), legacyNeighborhoodHex(0, 9));
  for (let i = 0; i < 30; i += 1) {
    const [lat, lon] = jitterInHex(HEX);
    assert.equal(neighborhoodHex(lat, lon), HEX);
  }
  const [lat, lon] = [38.9072, -77.0369];
  const covering = hexesCovering({ west: lon - 0.2, south: lat - 0.2, east: lon + 0.2, north: lat + 0.2 });
  assert.equal(covering.includes(HEX), true);
});
