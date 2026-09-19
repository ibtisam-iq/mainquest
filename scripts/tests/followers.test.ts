import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFollowers, parseIsoDate } from '../ingest/fields.ts';
import { resolveUpdated } from '../ingest/record.ts';
import { EMPTY_QUERY, effectiveSort, sortRecords } from '../../lib/query.ts';
import { formatDate, formatFollowers } from '../../lib/format.ts';
import type { CompanyRecord } from '../../lib/types.ts';

test('follower counts: only a trailing count is read', () => {
  assert.equal(parseFollowers('24K followers'), 24000);
  assert.equal(parseFollowers('1,234 followers'), 1234);
  assert.equal(parseFollowers('1.2M followers'), 1200000);
  assert.equal(parseFollowers('1 follower'), 1);
  assert.equal(parseFollowers('2 people from your company were hired here · 1K followers'), 1000);
  assert.equal(parseFollowers('Leveraging platforms to turn followers into advocates.'), null);
  assert.equal(parseFollowers(''), null);
});

test('dates: only real past or present calendar dates', () => {
  assert.equal(parseIsoDate('2026-09-03', '2026-09-10'), '2026-09-03');
  assert.equal(parseIsoDate('2026-02-30', '2026-09-10'), null);
  assert.equal(parseIsoDate('2026-09-11', '2026-09-10'), null);
  assert.equal(parseIsoDate('3 Sep 2026', '2026-09-10'), null);
});

const base = { handle: 'a', companyId: null, name: 'A', industry: 'x', hubs: ['lahore'], hq: 'local' as const, hqCountry: 'pk', origin: 'local' as const, originBasis: 'headquarters' as const, multiCity: false, website: null, founded: null, followers: 100, followersAsOf: '2026-09-03', members: null, membersAsOf: null, tags: [], specialties: null, offices: [] };

test('updated date: seeded from the source, kept while unchanged, moved on change', () => {
  assert.equal(resolveUpdated(undefined, base, '2026-09-03', '2026-09-10'), '2026-09-03');
  const prev: CompanyRecord = { ...base, updated: '2026-09-03' };
  assert.equal(resolveUpdated(prev, base, '2026-09-03', '2026-09-20'), '2026-09-03');
  assert.equal(resolveUpdated(prev, { ...base, website: 'https://a.pk/' }, '2026-09-03', '2026-09-20'), '2026-09-20');
  assert.equal(resolveUpdated({ ...base, updated: '' } as CompanyRecord, base, '2026-09-03', '2026-09-20'), '2026-09-03');
});

test('most followed first is the default, with or without filters, search or point', () => {
  assert.equal(effectiveSort(EMPTY_QUERY, false), 'followers');
  assert.equal(effectiveSort({ ...EMPTY_QUERY, hubs: ['lahore'] }, true), 'followers');
  assert.equal(effectiveSort({ ...EMPTY_QUERY, near: { lat: 0, lon: 0, label: '', ref: 'here' } }, false), 'followers');
  assert.equal(effectiveSort({ ...EMPTY_QUERY, sort: 'relevance' }, true), 'relevance');
  const rs = [{ handle: 'b', name: 'B', followers: null }, { handle: 'c', name: 'C', followers: 5000 }, { handle: 'd', name: 'D', followers: 20 }].map((r) => ({ ...base, ...r, specialtyCount: 0 }));
  assert.deepEqual(sortRecords(rs, 'followers', null, null).map((r) => r.handle), ['c', 'd', 'b']);
});

test('display formats', () => {
  assert.equal(formatFollowers(24000), '24K followers');
  assert.equal(formatFollowers(1200000), '1.2M followers');
  assert.equal(formatFollowers(1), '1 follower');
  assert.equal(formatDate('2026-09-05'), '5 Sep 2026');
});
