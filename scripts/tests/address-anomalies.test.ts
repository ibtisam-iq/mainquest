import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { CityIndex, PlaceIndex, geocodeText } from '../ingest/offices.ts';

const places = new PlaceIndex(fileURLToPath(new URL('../ingest/rules/places.json', import.meta.url)));
const cities = new CityIndex(fileURLToPath(new URL('../ingest/rules/city-centroids.json', import.meta.url)));

const place = (text: string, city = 'islamabad') => places.find(geocodeText(text), city)?.id ?? null;

test('NASTP at Chaklala Rawalpindi vs NSTP at NUST Islamabad', () => {
  // NASTP (National Aerospace Science and Technology Park, Rawalpindi)
  assert.equal(
    place('Office #1003, Alpha Techno Square (ATS), NASTP RWP, Old Airport Road, Islamabad', 'islamabad'),
    'rawalpindi:nastp',
  );
  assert.equal(
    place('Alpha Techno Square, NASTP Chaklala, Rawalpindi', 'rawalpindi'),
    'rawalpindi:nastp',
  );

  // NSTP (National Science and Technology Park at NUST Islamabad)
  assert.equal(
    place('National Science and Technology Park (NSTP), Islamabad, 44000', 'islamabad'),
    'islamabad:nust-nstp',
  );
});

test('DHA Phase 1 and 2 match across Islamabad and Rawalpindi designations', () => {
  // DHA Phase 1
  assert.equal(
    place('Plaza #38 Near SkyFitness Gym, DHA Phase 1, Rawalpindi', 'rawalpindi'),
    'islamabad:dha-phase-1',
  );
  assert.equal(
    place('Business Bay, Sector F Commercial, DHA Phase 1, Islamabad', 'islamabad'),
    'islamabad:dha-phase-1',
  );

  // DHA Phase 2
  assert.equal(
    place('Sector D, DHA Phase II, Rawalpindi, 46000', 'rawalpindi'),
    'islamabad:dha-phase-2',
  );
  assert.equal(
    place('Sector J, DHA Phase 2, Islamabad', 'islamabad'),
    'islamabad:dha-phase-2',
  );
});

test('PWD Housing Society matches whether written with Islamabad or Rawalpindi', () => {
  assert.equal(place('Main Double Road, PWD, Rawalpindi', 'rawalpindi'), 'islamabad:pwd');
  assert.equal(place('Block B, PWD Housing Society, Islamabad', 'islamabad'), 'islamabad:pwd');
});

test('road names with city components are not confused for the office city', () => {
  assert.equal(cities.choose('Main Peshawar Road, Rawalpindi'), 'rawalpindi');
  assert.equal(cities.choose('15 Km Multan Road, Lahore'), 'lahore');
  assert.equal(cities.choose('Sargodha Road, Faisalabad'), 'faisalabad');
  assert.equal(cities.choose('Karachi Company, G-9 Markaz, Islamabad'), 'islamabad');
});

test('chained inter-city highways resolve to terminal or postal city', () => {
  assert.equal(cities.choose('Lahore - Sheikhupura - Faisalabad Rd, 38000'), 'faisalabad');
});

test('abroad identification separates foreign locations from local commercial names', () => {
  // Indian Hyderabad distinguished by 6-digit PIN code
  assert.equal(cities.abroad('Gachibowli Hyderabad, 500032'), true);
  // Sindh Hyderabad with Pakistani 5-digit code or city name
  assert.equal(cities.abroad('Auto Bhan Road, Hyderabad, 71000'), false);

  // Dubai vs local building named Dubai Plaza
  assert.equal(cities.abroad('Floor 4, Sheikh Mohammed Bin Rashid Blvd, Dubai, UAE'), true);
  assert.equal(cities.abroad('Dubai Plaza, 6th Road, Rawalpindi, 46000'), false);
});
