import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_QUERY,
  FOLLOWER_BUCKETS,
  FOUNDED_BUCKETS,
  MEMBER_BUCKETS,
  activeFilterCount,
  rangeRuns,
  type Query,
} from '../../lib/query.ts';

test('activeFilterCount returns 0 for empty query', () => {
  assert.equal(activeFilterCount(EMPTY_QUERY), 0);
});

test('activeFilterCount counts single-value facets', () => {
  const q: Query = {
    ...EMPTY_QUERY,
    hubs: ['lahore'],
    inCities: ['islamabad'],
    areas: ['lahore:gulberg'],
    industries: ['software-development'],
    origins: ['local'],
    countries: ['us'],
    multi: true,
    web: true,
    placed: true,
    near: { lat: 31.52, lon: 74.35, label: 'Gulberg', ref: 'lahore:gulberg' },
  };
  // 10 active filter dimensions
  assert.equal(activeFilterCount(q), 10);
});

test('activeFilterCount handles specialty tag conjunction mode', () => {
  // Single tag: no conjunction chip added regardless of tagMatch
  assert.equal(activeFilterCount({ ...EMPTY_QUERY, tags: ['seo'], tagMatch: 'any' }), 1);
  assert.equal(activeFilterCount({ ...EMPTY_QUERY, tags: ['seo'], tagMatch: 'all' }), 1);

  // Multiple tags with 'any': count equals number of tags
  assert.equal(activeFilterCount({ ...EMPTY_QUERY, tags: ['seo', 'erp'], tagMatch: 'any' }), 2);

  // Multiple tags with 'all': count equals number of tags + 1 conjunction indicator
  assert.equal(activeFilterCount({ ...EMPTY_QUERY, tags: ['seo', 'erp'], tagMatch: 'all' }), 3);
  assert.equal(activeFilterCount({ ...EMPTY_QUERY, tags: ['seo', 'erp', 'crm'], tagMatch: 'all' }), 4);
});

test('activeFilterCount consolidates adjacent follower buckets into runs', () => {
  // Contiguous buckets consolidate to 1 chip
  const contiguous = activeFilterCount({ ...EMPTY_QUERY, followers: ['10k-100k', '100k-on'] });
  assert.equal(contiguous, 1);
  assert.equal(rangeRuns(['10k-100k', '100k-on'], FOLLOWER_BUCKETS).length, 1);

  // Disjoint buckets produce 2 chips
  const disjoint = activeFilterCount({ ...EMPTY_QUERY, followers: ['under-100', '100k-on'] });
  assert.equal(disjoint, 2);
  assert.equal(rangeRuns(['under-100', '100k-on'], FOLLOWER_BUCKETS).length, 2);

  // None (missing count) bucket is isolated
  const withNone = activeFilterCount({ ...EMPTY_QUERY, followers: ['under-100', '100-1k', 'none'] });
  assert.equal(withNone, 2);
});

test('activeFilterCount consolidates adjacent member buckets into runs', () => {
  // Contiguous buckets consolidate to 1 chip
  const contiguous = activeFilterCount({ ...EMPTY_QUERY, members: ['1-10', '11-50', '51-200'] });
  assert.equal(contiguous, 1);
  assert.equal(rangeRuns(['1-10', '11-50', '51-200'], MEMBER_BUCKETS).length, 1);

  // Disjoint buckets produce 2 chips
  const disjoint = activeFilterCount({ ...EMPTY_QUERY, members: ['1-10', '1001-on'] });
  assert.equal(disjoint, 2);
  assert.equal(rangeRuns(['1-10', '1001-on'], MEMBER_BUCKETS).length, 2);
});

test('activeFilterCount consolidates adjacent founded buckets into runs', () => {
  // Contiguous buckets consolidate to 1 chip
  const contiguous = activeFilterCount({ ...EMPTY_QUERY, founded: ['2020-2022', '2023-on'] });
  assert.equal(contiguous, 1);
  assert.equal(rangeRuns(['2020-2022', '2023-on'], FOUNDED_BUCKETS).length, 1);

  // Disjoint buckets produce 2 chips
  const disjoint = activeFilterCount({ ...EMPTY_QUERY, founded: ['before-2000', '2023-on'] });
  assert.equal(disjoint, 2);
  assert.equal(rangeRuns(['before-2000', '2023-on'], FOUNDED_BUCKETS).length, 2);
});

test('activeFilterCount matches Directory chip count on composite query', () => {
  const q: Query = {
    ...EMPTY_QUERY,
    hubs: ['twin-cities', 'lahore'], // 2 chips
    areas: ['islamabad:blue-area'], // 1 chip
    industries: ['software-development', 'information-technology'], // 2 chips
    tags: ['mobile-apps', 'react-native'], // 2 chips
    tagMatch: 'all', // 1 chip (All chosen specialties)
    origins: ['international'], // 1 chip
    countries: ['ae'], // 1 chip
    followers: ['1k-10k', '10k-100k'], // 1 chip (contiguous run)
    members: ['11-50', '51-200'], // 1 chip (contiguous run)
    founded: ['before-2000', '2023-on'], // 2 chips (disjoint runs)
    multi: true, // 1 chip
    web: true, // 1 chip
    placed: false,
    near: null,
  };

  // Expected chip total: 2 + 1 + 2 + 2 + 1 + 1 + 1 + 1 + 1 + 2 + 1 + 1 = 16
  assert.equal(activeFilterCount(q), 16);
});
