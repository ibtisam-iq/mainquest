// Twin cities addresses the Lahore re-check found placed wrongly, checked against the real rules files
// (decision 30). Bahria Town, DHA, Gulberg and Ghauri Town lie on the line between Islamabad and Rawalpindi,
// so their places match in either city.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { PlaceIndex, geocodeText } from '../ingest/offices.ts';

const places = new PlaceIndex(fileURLToPath(new URL('../ingest/rules/places.json', import.meta.url)));
const place = (text: string, city = 'islamabad') => places.find(geocodeText(text), city)?.id ?? null;

test('Gulberg Greens and Gulberg Residencia are two places', () => {
  assert.equal(place('Pakistan Office, Office 140, Luxus Mall, Gulberg Green, Islamabad, 44000'), 'islamabad:gulberg-greens');
  assert.equal(place('Head Office, Office no 23, Plot 102, Block D Markaz Gulberg Residencia, Islamabad, 56000'), 'islamabad:gulberg-residencia');
  // The lookup of "Gulberg Greens" once returned a hostel in Gulberg Residencia's market, 5 km east.
  const at = (id: string) => places.places.find((p) => p.id === id)!;
  assert.equal(at('islamabad:gulberg-greens').query, 'Gulberg Green, Islamabad');
  assert.deepEqual(at('islamabad:gulberg-residencia').point, [33.59976, 73.20998]);
});

test('Bahria Town\'s Civic Center is in Phase 4, however Bahria is written, and Bahria Enclave is not Bahria Town', () => {
  assert.equal(place('Headquarters, Bahira Town Civic Center, Office #306, Building #139, Islamabad, 44000'), 'rawalpindi:bahria-town-phase-4');
  assert.equal(place('CIVIC Center Phase-IV Behria Town, Rawalpindi', 'rawalpindi'), 'rawalpindi:bahria-town-phase-4');
  assert.equal(place('Headquarters, no 1, Ground Floor, Plot 127, Civic Center Phase 4, Rawalpindi, Islamabad', 'rawalpindi'), 'rawalpindi:bahria-town-phase-4');
  assert.equal(place('Islamabad Regional Office, Behria Springs North, Behria Expressway, Office- Suite 4, 2nd Floor'), 'rawalpindi:bahria-town-phase-7');
  assert.equal(place('74, BRC Tower, Sector G, Civic Centre, Bahria Enclave, Islamabad'), 'islamabad:bahria-enclave');
});

test('Ghauri Town is a place, whichever city the address gives', () => {
  assert.equal(place('Hamdan Heights, Phase 5 Ghauri Town, Islamabad, 44000'), 'islamabad:ghauri-town');
  assert.equal(place('Islamabad Expressway, 8, Hamdan Heights, Ghauri town Phase 5, 46000', 'rawalpindi'), 'islamabad:ghauri-town');
});

test('NUST\'s college on Peshawar Road is not its campus in H-12', () => {
  assert.equal(place('abcData, National Science and Technology Park (NSTP), Islamabad, 44000'), 'islamabad:nust-nstp');
  assert.equal(place('Headquarters, College of Electrical and Mechanical Engineering, NUST Peshawar Road, Islamabad'), null);
});
