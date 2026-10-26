// Karachi's addresses, checked against the real rules files (decision 31). Each case is an address from the
// source, shortened; the traps are places whose name contains a smaller place's, a building named after
// another scheme, spellings, and a company whose Karachi addresses add offices in other cities.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { CityIndex, PlaceIndex, buildOffices, geocodeText, newOfficeStats } from '../ingest/offices.ts';

const rules = (name: string) => fileURLToPath(new URL(`../ingest/rules/${name}`, import.meta.url));
const cities = new CityIndex(rules('city-centroids.json'));
const places = new PlaceIndex(rules('places.json'));
const place = (text: string) => places.find(geocodeText(text), 'karachi')?.id ?? null;

test('the smaller of two named places wins', () => {
  assert.equal(place('Headquarters, A-3/9 4th Floor, Block-E, North Nazimabad, Karachi, 74700'), 'karachi:north-nazimabad');
  assert.equal(place('Headquarters, Plot No. 150, Sector-23, Korangi Industrial Area, Karachi, 74900'), 'karachi:korangi-industrial-area');
  assert.equal(place('Headquarters, C-92, KDA Scheme #1, Karsaz, Karachi, 75350'), 'karachi:kda-scheme-1');
  assert.equal(place('Head Office:, 3rd Floor, Plot # 131/ll, Speedy Towers, Main Korangi Road, DHA Phase 1, Karachi, 75500'), 'karachi:dha-phase-1');
});

test('a name that contains a place\'s own, somewhere else, is not that place', () => {
  // Bahria Town Tower is a building in PECHS, 40 km from Bahria Town.
  assert.equal(place('Headquarters, Block 2, PECHS, Bahria Town Tower, Karachi, 75340'), 'karachi:pechs');
  assert.equal(place('Foran Private Limited, Bharia Town Karachi'), 'karachi:bahria-town');
  // Korangi Creek is a road in DHA, not the town of Korangi.
  assert.equal(place('Office 5, Korangi Creek Road, Karachi'), null);
});

test('spellings', () => {
  assert.equal(place('Karachi Office, House E-28, Street 3, Block F, Gulshan - e - jamal, Rashid Minhas Road, 75260'), 'karachi:gulshan-e-jamal');
  assert.equal(place('Head Office, 121-B, Block 6, P.E.C.H.S, Karachi'), 'karachi:pechs');
  assert.equal(place('Beaumont Road, Civil Lines, Karachi'), 'karachi:civil-lines');
});

test('places whose own lookup found something else are not in the list', () => {
  // These fall back to the geocoder: the place lookup for each returned a road, a building or a neighbour.
  assert.equal(place('Headquarters, Scheme 33, Karachi'), null);
  assert.equal(place('121-B, SMCHS Block B, Karachi, 75400'), null);
});

test('an address in Karachi and one in another city are two offices, one in each city', () => {
  const ctx = {
    cities, places, areaAliases: {}, areaLabels: new Map(), cityNames: cities.names(),
    hubCities: { 'twin-cities': ['islamabad', 'rawalpindi'], lahore: ['lahore'], karachi: ['karachi'] },
    cache: { version: 1 as const, entries: {} },
  };
  const offices = buildOffices({
    officeAddress: 'Headquarters, Mezzanine Floor D 26, Commercial Street, DHA Phase 2, Karachi | Head Office, 8, Garden Town, Lahore, 54000',
    operatingLocations: 'Karachi, Sindh; Lahore, Punjab', headquarters: '', hubs: new Set(['karachi', 'lahore']),
  }, ctx, newOfficeStats());
  assert.deepEqual(offices.map((o) => o.city).sort(), ['karachi', 'lahore']);
});
