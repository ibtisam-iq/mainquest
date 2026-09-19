// Faisalabad's addresses, checked against the real rules files (decision 29). Each case is an address
// from the source, shortened; the traps are roads named after other cities, a postal code standing in
// for the city, one neighbourhood inside another, and names Lahore shares.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { CityIndex, PlaceIndex, geocodeText } from '../ingest/offices.ts';

const rules = (name: string) => fileURLToPath(new URL(`../ingest/rules/${name}`, import.meta.url));
const cities = new CityIndex(rules('city-centroids.json'));
const places = new PlaceIndex(rules('places.json'));
const place = (text: string, city = 'faisalabad') => places.find(geocodeText(text), city)?.id ?? null;

test('a road named after another city is a road in Faisalabad', () => {
  for (const text of [
    'Headquarters, Sargodha Road, Faisalabad',
    'Jhang Road, Faisalabad',
    'Office# 68, 3rd Floor, Misaq ul Mall, Sheikhupura Road, Faisalabad, 38000',
    'Kohinoor City, Jaranwala Road, Faisalabad',
  ]) assert.equal(cities.choose(text), 'faisalabad', text);
  // One road named after three cities; the postal code places the office.
  assert.equal(cities.choose('Lahore - Sheikhupura - Faisalabad Rd, Bholay Di Jugi Taj Colony, 38000'), 'faisalabad');
});

test('an address without the city name is placed by its postal code', () => {
  assert.equal(cities.choose('FMC, Office no#13, The Arcadian Plaza, Kohinoor, 38000'), 'faisalabad');
  assert.equal(cities.choose('Lahore office, 3rd Floor, 21 K, Model Town, 54000'), 'lahore');
  // A named city wins over a postal code from elsewhere.
  assert.equal(cities.choose('Civic Center, Phase 4, Bahria Town, Asad Heights, Islamabad, 38000'), 'islamabad');
  // Faisalabad's old name.
  assert.equal(cities.choose('First Floor, The Mall of Lyallpur, Main Blvd Road, 38000'), 'faisalabad');
});

test('an office is placed in the neighbourhood its address names', () => {
  assert.equal(place('Pakistan (Faisalabad), Susan Road, Madina Town, 38000'), 'faisalabad:madina-town');
  assert.equal(place('45-46 Chenab Market, Susan Road, Faisalabad'), 'faisalabad:madina-town');
  assert.equal(place('Office # 3, 5th Floor Legacy Tower, Kohinoor City, Faisalabad, 38000'), 'faisalabad:kohinoor-city');
  assert.equal(place('Main Office Kohinoor, Office No 27 Second Floor Kohinoor Plaza 1 Faisalabad'), 'faisalabad:kohinoor-city');
  assert.equal(place('Regent Mall, ChenOne Road, D-Ground, 195C, Faisalabad, 38000'), 'faisalabad:d-ground');
  assert.equal(place('Beacon Plaza, P-17/1 New Civil Lines Bilal Road Faisalabad'), 'faisalabad:civil-lines');
  assert.equal(place('Adam Plaza, Bilal Chowk, Block B Samanabad, Faisalabad, 38000'), 'faisalabad:samanabad');
});

test('a neighbourhood inside a larger one wins when both are named', () => {
  assert.equal(place("City Emporium, D Ground Block B People's Colony No 1, Faisalabad, 38000"), 'faisalabad:d-ground');
  assert.equal(place('Ghauri Arcade, Satyana Road, Batala Colony, People Colony #2, Faisalabad'), 'faisalabad:batala-colony');
  assert.equal(place("Software Techno Park, Main E Canal Expy, People's Colony No 1, 38000"), 'faisalabad:peoples-colony');
});

test('names Faisalabad shares with Lahore stay in their own city, and a road or a bare city is no area', () => {
  assert.equal(place('Tech House, Gulberg A, HBL Bank Building, Faisalabad'), 'faisalabad:gulberg');
  assert.equal(place('Centre Point Plaza, Gulberg III, Lahore', 'lahore'), 'lahore:gulberg');
  assert.equal(place('Block B, Samanabad, Lahore', 'lahore'), null);
  assert.equal(place('Headquarters, Sargodha Road, Faisalabad'), null);
  assert.equal(place('Headquarters, Faisalabad, 38000'), null);
});
