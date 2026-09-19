import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_QUERY, FOLLOWER_BUCKETS, areasWithin, rangeRuns, cityOnlyNear, countFacet, effectiveSort, followerBucket, foundedBucket, matches, memberBucket, nearestPlacedKm, pageCount, pageWindow, parseQuery, serializeQuery, sortRecords, type Query } from '../../lib/query.ts';
import type { CoreRecord } from '../../lib/payload.ts';

const rec = (over: Partial<CoreRecord>): CoreRecord => ({
  handle: 'x', name: 'X', industry: 'software-development', hubs: ['twin-cities'], hq: 'local', hqCountry: 'pk', origin: 'local', originBasis: 'headquarters', multiCity: false,
  website: null, founded: null, followers: null, members: null, tags: [], offices: [], specialtyCount: 0, ...over,
});
const f7 = { city: 'islamabad', area: 'islamabad:f-7', lat: 33.72, lon: 73.056, precision: 'area' as const };
const cityOnly = { city: 'islamabad', area: null, lat: 33.693, lon: 73.065, precision: 'city' as const };
const lahore = { city: 'lahore', area: 'lahore:gulberg', lat: 31.516, lon: 74.341, precision: 'area' as const };
const lookup = (ref: string) => (ref === 'islamabad:f-7' ? { lat: 33.72, lon: 73.056, label: 'F-7, ISB' } : null);

test('the URL form round-trips every filter', () => {
  const q: Query = { ...EMPTY_QUERY, q: 'devops', hubs: ['lahore', 'karachi'], inCities: ['peshawar'], tags: ['seo', 'erp'], tagMatch: 'all', origins: ['registered-abroad', 'international'], countries: ['ae'], multi: true, web: true, founded: ['2023-on', 'unknown'], followers: ['1k-10k', 'none'], members: ['11-50'], placed: true, near: { lat: 33.72, lon: 73.056, label: 'F-7, ISB', ref: 'islamabad:f-7' }, radius: 5, sort: 'distance', view: 'map', page: 3, per: 50 };
  const back = parseQuery(new URLSearchParams(serializeQuery(q)), lookup);
  assert.deepEqual(back, q);
  assert.equal(serializeQuery(EMPTY_QUERY), '');
});

test('unknown or malformed URL values fall back to defaults', () => {
  const q = parseQuery(new URLSearchParams('hq=elsewhere&origin=somewhere&r=7&founded=1999,2023-on&followers=huge,100k-on&members=7&sort=random&near=nowhere'), lookup);
  assert.deepEqual(q.origins, []);
  assert.equal(q.radius, 10);
  assert.deepEqual(q.founded, ['2023-on']);
  assert.deepEqual(q.followers, ['100k-on']);
  assert.deepEqual(q.members, []);
  assert.equal(q.sort, null);
  assert.equal(q.near, null);
});

test('filters combine: values within a facet widen, facets narrow', () => {
  const a = rec({ handle: 'a', hubs: ['lahore'], tags: ['seo'], website: 'https://a.pk/' });
  const b = rec({ handle: 'b', hubs: ['karachi'], tags: ['erp'] });
  const q = { ...EMPTY_QUERY, hubs: ['lahore', 'karachi'] };
  assert.equal(matches(a, q, null), true);
  assert.equal(matches(b, q, null), true);
  assert.equal(matches(b, { ...q, web: true }, null), false);
  assert.equal(matches(a, q, new Set(['b'])), false, 'search hits narrow the list');
});

test('a facet counts each value as if its own selection were cleared', () => {
  const rs = [rec({ handle: 'a', hubs: ['lahore'] }), rec({ handle: 'b', hubs: ['karachi'] }), rec({ handle: 'c', hubs: ['karachi'], website: 'https://c.pk/' })];
  const counts = countFacet(rs, { ...EMPTY_QUERY, hubs: ['lahore'], web: true }, null, 'hubs', (r) => r.hubs);
  assert.deepEqual([...counts], [['karachi', 1]]);
});

test('distance ignores offices known only by city, and those companies are listed apart', () => {
  const near = { lat: 33.72, lon: 73.056, label: 'F-7', ref: 'islamabad:f-7' };
  const placed = rec({ handle: 'p', offices: [cityOnly, f7] });
  const onlyCity = rec({ handle: 'c', offices: [cityOnly] });
  const far = rec({ handle: 'l', hubs: ['lahore'], offices: [lahore] });
  assert.equal(nearestPlacedKm(onlyCity, near), null);
  assert.equal(nearestPlacedKm(placed, near)?.office, 1);
  const q = { ...EMPTY_QUERY, near, radius: 5 };
  assert.deepEqual([placed, onlyCity, far].filter((r) => matches(r, q, null)).map((r) => r.handle), ['p']);
  const grouped = cityOnlyNear([placed, onlyCity, far], q, null, [{ id: 'islamabad', lat: 33.693, lon: 73.065 }, { id: 'lahore', lat: 31.52, lon: 74.36 }]);
  assert.deepEqual([...grouped].map(([city, rs]) => [city, rs.map((r) => r.handle)]), [['islamabad', ['c']]]);
});

test('sorting: names ignore leading symbols; nearest applies only with a point', () => {
  const rs = [rec({ handle: 'g', name: '(GDSC) Google' }), rec({ handle: 'a', name: '"AI Aura"' }), rec({ handle: 'b', name: 'Beta' })];
  assert.deepEqual(sortRecords(rs, 'name', null, null).map((r) => r.handle), ['a', 'b', 'g']);
  assert.equal(effectiveSort({ ...EMPTY_QUERY, sort: 'distance' }, false), 'followers');
  assert.equal(effectiveSort({ ...EMPTY_QUERY, sort: 'distance', near: { lat: 0, lon: 0, label: '', ref: 'here' } }, false), 'distance');
});

test('pages: size and number come from the URL, with safe defaults', () => {
  const q = parseQuery(new URLSearchParams('page=0&per=30'), lookup);
  assert.equal(q.page, 1);
  assert.equal(q.per, 10);
  assert.equal(parseQuery(new URLSearchParams('page=7&per=100'), lookup).page, 7);
  assert.equal(serializeQuery({ ...EMPTY_QUERY, page: 1, per: 10 }), '');
  assert.equal(serializeQuery({ ...EMPTY_QUERY, per: 25 }), 'per=25');
  assert.equal(pageCount(13542, 10), 1355);
  assert.equal(pageCount(0, 25), 1);
});

test('pager: first, last, a window around the current page, and gaps', () => {
  assert.deepEqual(pageWindow(1, 542), [1, 2, 3, 4, 5, 'gap', 542]);
  assert.deepEqual(pageWindow(10, 542), [1, 'gap', 8, 9, 10, 11, 12, 'gap', 542]);
  assert.deepEqual(pageWindow(542, 542), [1, 'gap', 538, 539, 540, 541, 542]);
  assert.deepEqual(pageWindow(4, 542), [1, 2, 3, 4, 5, 6, 'gap', 542]);
  assert.deepEqual(pageWindow(2, 3), [1, 2, 3]);
  assert.deepEqual(pageWindow(1, 1), [1]);
});

test('links shared before the founding years were split still open the same years', () => {
  assert.deepEqual(parseQuery(new URLSearchParams('founded=2020-on,before-2010'), lookup).founded, ['2023-on', '2020-2022', '2000-2009', 'before-2000']);
  assert.deepEqual(parseQuery(new URLSearchParams('founded=2010-2019,2015-2019'), lookup).founded, ['2015-2019', '2010-2014']);
});

test('numbers fall in ranges that include their lower end, and a missing number has its own range', () => {
  assert.equal(followerBucket(99), 'under-100');
  assert.equal(followerBucket(100), '100-1k');
  assert.equal(followerBucket(1000), '1k-10k');
  assert.equal(followerBucket(295000), '100k-on');
  assert.equal(followerBucket(null), 'none');
  assert.equal(memberBucket(10), '1-10');
  assert.equal(memberBucket(11), '11-50');
  assert.equal(memberBucket(1000), '201-1000');
  assert.equal(memberBucket(1001), '1001-on');
  assert.equal(memberBucket(null), 'none');
  assert.equal(foundedBucket(2023), '2023-on');
  assert.equal(foundedBucket(2019), '2015-2019');
  assert.equal(foundedBucket(1999), 'before-2000');
  assert.equal(foundedBucket(null), 'unknown');
});

test('followers, members and placement narrow the list', () => {
  const big = rec({ handle: 'big', followers: 50000, members: 120, offices: [f7] });
  const small = rec({ handle: 'small', followers: 40, offices: [cityOnly] });
  const rs = [big, small];
  const pick = (q: Partial<Query>) => rs.filter((r) => matches(r, { ...EMPTY_QUERY, ...q }, null)).map((r) => r.handle);
  assert.deepEqual(pick({ followers: ['10k-100k'] }), ['big']);
  assert.deepEqual(pick({ followers: ['under-100', '10k-100k'] }), ['big', 'small']);
  assert.deepEqual(pick({ members: ['none'] }), ['small']);
  assert.deepEqual(pick({ placed: true }), ['big']);
});

test('specialties match any or all of the chosen ones, and their counts follow', () => {
  const both = rec({ handle: 'both', tags: ['seo', 'erp'] });
  const one = rec({ handle: 'one', tags: ['seo', 'crm'] });
  const rs = [both, one];
  const any = { ...EMPTY_QUERY, tags: ['seo', 'erp'] };
  const all = { ...any, tagMatch: 'all' as const };
  assert.deepEqual(rs.filter((r) => matches(r, any, null)).map((r) => r.handle), ['both', 'one']);
  assert.deepEqual(rs.filter((r) => matches(r, all, null)).map((r) => r.handle), ['both']);
  assert.deepEqual([...countFacet(rs, all, null, null, (r) => r.tags)].sort(), [['erp', 1], ['seo', 1]]);
  assert.equal(serializeQuery({ ...EMPTY_QUERY, tags: ['seo'], tagMatch: 'all' }), 'specialty=seo', 'one specialty needs no match setting');
});

test('changing the chosen cities keeps the areas that are still inside them', () => {
  const hubCities = new Map([['twin-cities', ['islamabad', 'rawalpindi']], ['lahore', ['lahore']], ['other-cities', []]]);
  const areas = ['islamabad:f-7', 'lahore:gulberg', 'sahiwal:ali-garden'];
  assert.deepEqual(areasWithin(areas, ['twin-cities', 'karachi'], hubCities), ['islamabad:f-7']);
  assert.deepEqual(areasWithin(areas, [], hubCities), areas);
  assert.deepEqual(areasWithin(areas, ['other-cities'], hubCities), ['sahiwal:ali-garden']);
});

test('adjacent chosen ranges group together, and the missing-number range stands alone', () => {
  const runs = rangeRuns(['10k-100k', '100k-on', 'under-100', 'none'], FOLLOWER_BUCKETS).map((r) => r.map((b) => b.id));
  assert.deepEqual(runs, [['under-100'], ['10k-100k', '100k-on'], ['none']]);
});

test('links from before the origin filter still open the same companies', () => {
  assert.deepEqual(parseQuery(new URLSearchParams('hq=local'), lookup).origins, ['local']);
  assert.deepEqual(parseQuery(new URLSearchParams('hq=foreign'), lookup).origins, ['registered-abroad', 'international', 'unclear']);
  assert.equal(serializeQuery(parseQuery(new URLSearchParams('hq=local'), lookup)), 'origin=local');
});

test('a city filter keeps companies with an office in that city, whatever their hub', () => {
  const q = parseQuery(new URLSearchParams('in=lahore'), lookup);
  assert.deepEqual(q.inCities, ['lahore']);
  assert.ok(matches(rec({ offices: [f7, lahore] }), q, null));
  assert.ok(!matches(rec({ offices: [f7, cityOnly] }), q, null));
  assert.equal(serializeQuery(q), 'in=lahore');
});
