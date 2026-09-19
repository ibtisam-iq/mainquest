import { test } from 'node:test';
import assert from 'node:assert/strict';
import { determineHubs, hqRelation, isMultiCity } from '../ingest/classify.ts';

const hubs = (op: string, addr = '', hq = '') => [...determineHubs(op, addr, hq)].sort();

test('Islamabad and Rawalpindi share the twin-cities hub', () => {
  assert.deepEqual(hubs('Islamabad'), ['twin-cities']);
  assert.deepEqual(hubs('Rawalpindi, Punjab'), ['twin-cities']);
  assert.deepEqual(hubs('Islāmābād'), ['twin-cities']);
  assert.deepEqual(hubs('', 'NSTP, H-12'), ['twin-cities']);
});

test('matches the diacritic and misspelt forms the upstream data contains', () => {
  assert.deepEqual(hubs('Karāchi'), ['karachi']);
  assert.deepEqual(hubs('Faislabad'), ['faisalabad']);
});

test('NASTP counts as twin cities only when no other hub city is named', () => {
  assert.deepEqual(hubs('', 'NASTP Chaklala'), ['twin-cities']);
  assert.deepEqual(hubs('', 'NASTP, Lahore'), ['lahore']);
});

test('a company can sit in several hubs, and unknown places fall back to other cities', () => {
  assert.deepEqual(hubs('Islamabad; Lahore, Punjab'), ['lahore', 'twin-cities']);
  assert.deepEqual(hubs('Skardu'), ['other-cities']);
});

test('headquarters split keeps the upstream quirk for the diacritic spelling', () => {
  assert.equal(hqRelation('Karachi, Sindh'), 'local');
  assert.equal(hqRelation('Pakistan'), 'local');
  assert.equal(hqRelation('Dubai'), 'foreign');
  assert.equal(hqRelation('Karāchi'), 'foreign');
});

test('multi-city counts two separated locations even inside one hub', () => {
  assert.equal(isMultiCity('Islamabad; Rawalpindi, Punjab', determineHubs('Islamabad; Rawalpindi, Punjab', '', '')), true);
  assert.equal(isMultiCity('Lahore, Punjab', determineHubs('Lahore, Punjab', '', '')), false);
});
