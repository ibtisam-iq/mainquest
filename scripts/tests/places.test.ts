import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PlaceIndex, placePoint, type GeoCache } from '../ingest/offices.ts';
import { CityIndex } from '../ingest/offices.ts';
import { fileURLToPath } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'places-'));
const file = join(dir, 'places.json');
writeFileSync(file, JSON.stringify({ places: [
  { id: 'islamabad:f-7', label: 'F-7', cities: ['islamabad'], query: 'F-7, Islamabad', match: [['f 7'], ['f7']] },
  { id: 'islamabad:dha-phase-2', label: 'DHA Phase 2', cities: ['islamabad'], query: 'DHA Phase 2', match: [['dha', 'phase 2'], ['dha ii']] },
  { id: 'lahore:gulberg', label: 'Gulberg', cities: ['lahore'], query: 'Gulberg, Lahore', match: [['gulberg']], point: [31.51, 74.34] },
] }));
const places = new PlaceIndex(file);
const cities = new CityIndex(fileURLToPath(new URL('../ingest/rules/city-centroids.json', import.meta.url)));

test('a place matches only inside its own cities', () => {
  assert.equal(places.find('Office 5, F-7 Markaz', 'islamabad')?.id, 'islamabad:f-7');
  assert.equal(places.find('Block F-7, Gulberg', 'lahore')?.id, 'lahore:gulberg');
  assert.equal(places.find('F-7 Markaz', 'karachi'), null);
});

test('every phrase of an alternative must appear, and the most specific place wins', () => {
  assert.equal(places.find('Plaza 82, Sector H, DHA Phase 2', 'islamabad')?.id, 'islamabad:dha-phase-2');
  assert.equal(places.find('Phase 2 Commercial', 'islamabad'), null);
  assert.equal(places.find('House 3, F-7/2, near DHA Phase 2 office', 'islamabad')?.id, 'islamabad:dha-phase-2');
  assert.equal(places.find('Office F-70', 'islamabad'), null);
});

test('a fixed point overrides the lookup; a city-level lookup is not a place', () => {
  const cache: GeoCache = { version: 1, entries: {} };
  assert.deepEqual(placePoint(places.places[2], cache, cities), { lat: 31.51, lon: 74.34 });
  cache.entries['p|islamabad:f-7|f 7 islamabad'] = { lat: 33.69, lon: 73.06, type: 'city', cat: 'place', area: null, place: 'Islamabad', cc: 'pk', country: 'Pakistan', q: 1 };
  assert.equal(placePoint(places.places[0], cache, cities), null);
  cache.entries['p|islamabad:f-7|f 7 islamabad'] = { lat: 33.72, lon: 73.056, type: 'suburb', cat: 'place', area: 'F-7', place: 'Islamabad', cc: 'pk', country: 'Pakistan', q: 1 };
  assert.deepEqual(placePoint(places.places[0], cache, cities), { lat: 33.72, lon: 73.056 });
});
