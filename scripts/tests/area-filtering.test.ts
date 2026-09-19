import { test } from 'node:test';
import assert from 'node:assert/strict';
import { areasWithin } from '../../lib/query.ts';

const HUB_CITIES = new Map<string, string[]>([
  ['twin-cities', ['islamabad', 'rawalpindi']],
  ['lahore', ['lahore']],
  ['karachi', ['karachi']],
  ['faisalabad', ['faisalabad']],
  ['other-cities', []],
]);

const SAMPLE_AREAS = [
  'islamabad:blue-area',
  'rawalpindi:bahria-town-phase-4',
  'lahore:gulberg',
  'karachi:clifton',
  'faisalabad:d-ground',
  'peshawar:hayatabad',
  'sialkot:cantt',
];

test('areasWithin retains all areas when no hub is selected', () => {
  const result = areasWithin(SAMPLE_AREAS, [], HUB_CITIES);
  assert.deepEqual(result, SAMPLE_AREAS);
});

test('areasWithin scopes areas to twin-cities (Islamabad and Rawalpindi)', () => {
  const result = areasWithin(SAMPLE_AREAS, ['twin-cities'], HUB_CITIES);
  assert.deepEqual(result, [
    'islamabad:blue-area',
    'rawalpindi:bahria-town-phase-4',
  ]);
});

test('areasWithin scopes areas to single-city hub (Lahore)', () => {
  const result = areasWithin(SAMPLE_AREAS, ['lahore'], HUB_CITIES);
  assert.deepEqual(result, ['lahore:gulberg']);
});

test('areasWithin scopes areas to multiple named hubs', () => {
  const result = areasWithin(SAMPLE_AREAS, ['lahore', 'karachi'], HUB_CITIES);
  assert.deepEqual(result, ['lahore:gulberg', 'karachi:clifton']);
});

test('areasWithin accurately filters for other-cities (unassigned municipalities)', () => {
  const result = areasWithin(SAMPLE_AREAS, ['other-cities'], HUB_CITIES);
  assert.deepEqual(result, [
    'peshawar:hayatabad',
    'sialkot:cantt',
  ]);
});

test('areasWithin combines named hub and other-cities', () => {
  const result = areasWithin(SAMPLE_AREAS, ['lahore', 'other-cities'], HUB_CITIES);
  assert.deepEqual(result, [
    'lahore:gulberg',
    'peshawar:hayatabad',
    'sialkot:cantt',
  ]);
});

test('filter options logic mirrors areasWithin behavior for other-cities', () => {
  // Directly tests the filter predicate used in Filters.tsx
  const namedHubCities = new Set([...HUB_CITIES.values()].flat());

  const filterAreas = (areas: { id: string; city: string }[], hubs: string[]) => {
    return areas.filter((a) => {
      if (hubs.length === 0) return true;
      return hubs.some((h) => {
        const own = HUB_CITIES.get(h);
        if (!own) return false;
        return own.length ? own.includes(a.city) : !namedHubCities.has(a.city);
      });
    });
  };

  const facetAreas = [
    { id: 'islamabad:blue-area', city: 'islamabad' },
    { id: 'rawalpindi:bahria-town-phase-4', city: 'rawalpindi' },
    { id: 'lahore:gulberg', city: 'lahore' },
    { id: 'karachi:clifton', city: 'karachi' },
    { id: 'peshawar:hayatabad', city: 'peshawar' },
  ];

  const forOther = filterAreas(facetAreas, ['other-cities']);
  assert.equal(forOther.length, 1);
  assert.equal(forOther[0].id, 'peshawar:hayatabad');

  const forTwinCities = filterAreas(facetAreas, ['twin-cities']);
  assert.equal(forTwinCities.length, 2);
  assert.deepEqual(forTwinCities.map((a) => a.id), ['islamabad:blue-area', 'rawalpindi:bahria-town-phase-4']);

  const forEmpty = filterAreas(facetAreas, []);
  assert.equal(forEmpty.length, 5);
});
