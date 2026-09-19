import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMembers } from '../ingest/fields.ts';
import { resolveRecordedDate, resolveUpdated } from '../ingest/record.ts';
import { listSpecialties, otherChips } from '../../lib/specialties.ts';
import { splitPayload } from '../../lib/payload.ts';
import { formatMembers } from '../../lib/format.ts';
import type { CompanyRecord } from '../../lib/types.ts';

test('associated members: only a bare whole number is read', () => {
  assert.equal(parseMembers('757'), 757);
  assert.equal(parseMembers('1,129'), 1129);
  assert.equal(parseMembers(' 5111 '), 5111);
  assert.equal(parseMembers(''), null);
  assert.equal(parseMembers('1,12'), null);
  assert.equal(parseMembers('about 40'), null);
  assert.equal(parseMembers('51-200'), null);
});

test('recorded date: set on first sight, kept while the count holds, moved when it changes', () => {
  assert.equal(resolveRecordedDate(undefined, undefined, 757, '2026-09-10'), '2026-09-10');
  assert.equal(resolveRecordedDate(757, '2026-09-10', 757, '2026-09-20'), '2026-09-10');
  assert.equal(resolveRecordedDate(757, '2026-09-10', 760, '2026-09-20'), '2026-09-20');
  assert.equal(resolveRecordedDate(757, '2026-09-10', null, '2026-09-20'), null);
});

const base: CompanyRecord = { handle: 'a', companyId: null, name: 'A', industry: 'x', hubs: ['lahore'], hq: 'local', hqCountry: 'pk', origin: 'local', originBasis: 'headquarters', multiCity: false, website: null, founded: null, followers: 100, followersAsOf: '2026-09-03', members: null, membersAsOf: null, tags: [], specialties: null, offices: [], updated: '2026-09-03' };

test('a newly published field moves the updated date only where it holds a value', () => {
  const { members: _m, membersAsOf: _d, updated: _u, ...older } = base;
  const previous = { ...older, updated: '2026-09-03' } as CompanyRecord;
  const { updated: _u2, ...next } = base;
  assert.equal(resolveUpdated(previous, next, '2026-09-03', '2026-09-10'), '2026-09-03');
  assert.equal(resolveUpdated(previous, { ...next, members: 12, membersAsOf: '2026-09-10' }, '2026-09-03', '2026-09-10'), '2026-09-10');
});

test('specialties are counted once each, without filler', () => {
  assert.deepEqual(listSpecialties('Web Development, SEO, web development, etc, and Cloud Migration.'), ['Web Development', 'SEO', 'Cloud Migration']);
  assert.deepEqual(listSpecialties(null), []);
  const { core, extra } = splitPayload([{ ...base, specialties: 'AI, ML; DevOps', members: 8, membersAsOf: '2026-09-10' }]);
  assert.equal(core[0].specialtyCount, 3);
  assert.equal(core[0].members, 8);
  assert.equal('membersAsOf' in core[0], false);
  assert.equal(extra.a.membersAsOf, '2026-09-10');
});

test('associated members are shown in full', () => {
  assert.equal(formatMembers(1129), '1,129 associated members');
  assert.equal(formatMembers(1), '1 associated member');
});

test('chips: shared tags first, then the company\'s other specialties in its own order, five at most', () => {
  const text = 'Messaging APIs, SMS, Cloud Communication, CPaaS, Voice, Email, Web Chat';
  assert.deepEqual(otherChips(['sms'], text, {}), ['Messaging APIs', 'Cloud Communication', 'CPaaS', 'Voice']);
  assert.deepEqual(otherChips(['sms'], 'Short Messages, Voice', { 'short-messages': 'sms' }), ['Voice']);
  assert.deepEqual(otherChips(['a', 'b', 'c', 'd', 'e', 'f'], text, {}), []);
  assert.deepEqual(otherChips([], null, {}), []);
});
