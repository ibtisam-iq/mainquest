import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { CityIndex, OFFICE_KEY, PlaceIndex, agreeingName, buildOffices, streetName, cityNameCandidates, cleanAddress, fallbackQuery, geocodeText, isDetailedAddress, newOfficeStats, precisionOf, type GeoHit } from '../ingest/offices.ts';

const cities = new CityIndex(fileURLToPath(new URL('../ingest/rules/city-centroids.json', import.meta.url)));
const hit = (type: string, cat = 'place'): GeoHit => ({ lat: 33.7, lon: 73.0, type, cat, area: null, place: null, cc: 'pk', country: 'Pakistan', q: 1 });

test('address cleaning strips the note suffix, links and placeholders', () => {
  assert.equal(cleanAddress('Islamabad (No street address listed on SomeSite)'), 'Islamabad');
  assert.equal(cleanAddress('Headquarters'), null);
  assert.equal(cleanAddress('None Listed on Page'), null);
  assert.equal(cleanAddress('https://maps.example.test/x, Block D, Johar Town, Lahore'), 'Block D, Johar Town, Lahore');
  assert.equal(cleanAddress('Sector G-6,, Islamabad'), 'Sector G-6, Islamabad');
});

test('office labels and unit numbers are removed before geocoding', () => {
  assert.equal(geocodeText('Headquarters, Plaza 159, Bahria Town Phase 7, Rawalpindi'), 'Plaza 159, Bahria Town Phase 7, Rawalpindi');
  assert.equal(geocodeText('Lahore Office, 27/F, PIA Society, Johar Town, Lahore'), '27/F, PIA Society, Johar Town, Lahore');
  assert.equal(geocodeText('3rd Floor, Plaza 82, Sector H DHA Phase 2'), 'Plaza 82, Sector H DHA Phase 2');
});

test('a city plus a postal code is not detailed enough to geocode', () => {
  assert.equal(isDetailedAddress('Headquarters, Rawalpindi, 46000'), false);
  assert.equal(isDetailedAddress('Karachi, Sindh'), false);
  assert.equal(isDetailedAddress('Plot 44, Sector F, DHA Phase 1, Islamabad'), true);
});

test('the retry query keeps the area segments and adds the city', () => {
  assert.equal(fallbackQuery('29 Spring North, St 16, Bahria Town Phase 7, Rawalpindi, 46220', 'Rawalpindi'), 'Bahria Town Phase 7, Rawalpindi');
});

test('geocoder result types map to precision tiers', () => {
  assert.equal(precisionOf(hit('building', 'building')), 'street');
  assert.equal(precisionOf(hit('road', 'highway')), 'street');
  assert.equal(precisionOf(hit('suburb')), 'area');
  assert.equal(precisionOf(hit('city')), 'city');
  assert.equal(precisionOf(hit('state')), 'city');
  assert.equal(precisionOf(hit('postcode')), 'city');
});

test('city detection handles typos, neighbourhoods and postal codes', () => {
  assert.equal(cities.choose('Headquarters, Islambad, 04403'), 'islamabad');
  assert.equal(cities.choose('North Nazimabad'), 'karachi');
  assert.equal(cities.choose('DHA Phase 1, 75500'), 'karachi');
  assert.equal(cities.choose('Block B, Satellite Town, Rawalpindi'), 'rawalpindi');
  assert.equal(cities.choose('Remote'), null);
});

test('a neighbourhood name stands for its city only when the address names no city', () => {
  assert.equal(cities.choose('Tariq Road, Near SB Store'), 'karachi');
  assert.equal(cities.choose('RHK Plaza, Basement Tariq Road, Near Allied Bank, Faisalabad, 38000'), 'faisalabad');
  assert.equal(cities.choose('Nazimabad, Faisalabad, 38000'), 'faisalabad');
  assert.equal(cities.choose("City Emporium, Shahr-e-Faisal, D Ground Block B People's Colony No 1, Faisalabad"), 'faisalabad');
  assert.equal(cities.choose('Dawood Center, MT Road, Clifton, Karachi'), 'karachi');
  // A neighbourhood is an area, not a city, so a lookup may name it as an office's area.
  assert.ok(!cities.names().has('clifton'));
  assert.ok(cities.names().has('karachi'));
});

test('a city named in a road or a market is not the office city', () => {
  assert.equal(cities.choose('Suzuki Center, Lane 1, Main Peshawar Road, Rawalpindi, 46000'), 'rawalpindi');
  assert.equal(cities.choose('Regus Enterprise Centre, 15 Km Multan Road, Lahore'), 'lahore');
  assert.equal(cities.choose('P-24, Phase 1 Sargodha Road, Gulshan E Madina, Faislabad, 38090'), 'faisalabad');
  assert.equal(cities.choose('Shop 4, Karachi Company, G-9 Markaz, Islamabad'), 'islamabad');
  assert.equal(cities.choose('Regional Office, Gilgit Baltistan, Sher Ali Chowk, Skardu, 16100'), 'skardu');
});

test('an address naming two cities is settled by its postal code, then by a town written with its city', () => {
  assert.equal(cities.choose('Office 5, Rawalpindi / Islamabad, 44000'), 'islamabad');
  assert.equal(cities.choose('Saba Plaza, Haider Road, Saddar, Rawalpindi / Islamabad, 46000'), 'rawalpindi');
  assert.equal(cities.choose('Street No 1, Wah Model Town, Wah Cantt, Rawalpindi, 47040'), 'wah');
});

test('cities learned from the data are recognised as whole address parts only', () => {
  const learned = new CityIndex(fileURLToPath(new URL('../ingest/rules/city-centroids.json', import.meta.url)), {
    cities: { sahiwal: { label: 'Sahiwal', lat: 30.66, lon: 73.1, keywords: ['Sahiwal'], postalPrefixes: [], learned: true } },
    spellings: { Queta: 'quetta' },
  });
  assert.equal(learned.choose('Saeed Center, Farid Town Road, Sahiwal, 57000'), 'sahiwal');
  assert.equal(learned.choose('Office 3, Sahiwal Chowk, Lahore'), 'lahore');
  assert.equal(learned.choose('Jinnah Road, Queta'), 'quetta');
  assert.deepEqual(cityNameCandidates('Sahiwal, Punjab; Lahore, Punjab', 'Office 2, Ali Garden, Sahiwal, Punjab | Remote'), ['Sahiwal', 'Lahore', 'Sahiwal']);
});

test('a lookup result counts only through a name the address itself contains', () => {
  const names = cities.names();
  const address = 'Pakistan Town Phase 2, Office# G43, St# 18, Islamabad, 44000';
  assert.equal(agreeingName(['Korang Town'], address, names), null);
  assert.equal(agreeingName(['Pakistan Town Phase 2', 'Korang Town'], address, names), 'Pakistan Town Phase 2');
  assert.equal(agreeingName(['DHA Phase 2'], 'Sector H, DHA Phase II, Islamabad', names), 'DHA Phase 2');
  assert.equal(agreeingName(['Islamabad'], 'Blue Area, Islamabad', names), null);
});

test('an office is labelled with the area its address names, or kept at city level', () => {
  const places = new PlaceIndex(fileURLToPath(new URL('../ingest/rules/places.json', import.meta.url)));
  const named = 'Pakistan Town Phase 2, Office# G43, St# 18, Islamabad, 44000';
  const unnamed = 'Office 7, Street 18, Phase 2, Islamabad, 44000';
  const found = (name: string): GeoHit => ({ lat: 33.5755, lon: 73.1439, type: 'residential', cat: 'landuse', area: 'Korang Town', place: 'Islamabad', cc: 'pk', country: 'Pakistan', q: 2, name, areas: ['Korang Town'] });
  const ctx = {
    cities, places, areaAliases: {}, areaLabels: new Map(), hubCities: { 'twin-cities': ['islamabad', 'rawalpindi'] }, cityNames: cities.names(),
    cache: { version: 1 as const, entries: { [OFFICE_KEY(named)]: found('Pakistan Town Phase 2'), [OFFICE_KEY(unnamed)]: found('Korang Town') } },
  };
  const build = (address: string) => buildOffices({ officeAddress: address, operatingLocations: 'Islamabad', headquarters: '', hubs: new Set(['twin-cities']) }, ctx, newOfficeStats());
  assert.deepEqual(build(named).map((o) => [o.city, o.area, o.precision]), [['islamabad', 'islamabad:pakistan-town-phase-2', 'area']]);
  assert.deepEqual(build(unnamed).map((o) => [o.city, o.area, o.precision]), [['islamabad', null, 'city']]);
});

test('a street position needs a building or road the address names, more specific than its area', () => {
  const names = cities.names();
  const at = (type: string, cat: string, name: string): GeoHit => ({ lat: 33.67, lon: 73.07, type, cat, area: null, place: null, cc: 'pk', country: 'Pakistan', q: 1, name, areas: [] });
  // A building the address names.
  assert.equal(streetName(at('building', 'building', 'Galleria Plaza'), 'Office No. 1, Galleria Plaza, I-8 Markaz, Islamabad', ['I-8'], names), 'Galleria Plaza');
  // A market zone named after the area it is in says no more than the area.
  assert.equal(streetName(at('retail', 'landuse', 'I-8 Markaz'), 'Headquarters, I-8 markaz, islamabad', ['I-8'], names), null);
  // A restaurant that happens to lie in the area is not the office.
  assert.equal(streetName(at('amenity', 'amenity', 'Labaik Restaurant Millat Town'), 'Headquarters, 310-D, Millat Town, Faisalabad, 38000', ['Millat Town'], names), null);
  // A shop named after the place itself.
  assert.equal(streetName(at('shop', 'shop', 'Pearl City'), 'Headquarters, Pearl City Tower, Sargodha Road, Faisalabad', ['Pearl City'], names), null);
  // A named road inside the area.
  assert.equal(streetName(at('road', 'highway', 'Gomal Road'), '64, Gomal Road, E-7, Islamabad, 44000', ['E-7'], names), 'Gomal Road');
});
