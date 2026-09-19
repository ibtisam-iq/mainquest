import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanSpecialties, cleanText, cleanWebsite, isInterfaceText, parseFounded } from '../ingest/fields.ts';

const profileDomain = 'example-profiles.test';

test('websites: tracking removed, scheme added, self links and odd schemes dropped', () => {
  assert.deepEqual(cleanWebsite('https://acme.pk/?utm_source=x&utm_medium=y&ref=1', profileDomain), { value: 'https://acme.pk/?ref=1', trackingStripped: true });
  assert.deepEqual(cleanWebsite('www.acme.pk', profileDomain), { value: 'https://www.acme.pk/', trackingStripped: false });
  assert.deepEqual(cleanWebsite('https://www.example-profiles.test/company/acme', profileDomain), { value: null, dropped: 'self_link' });
  assert.deepEqual(cleanWebsite('ftp://acme.pk', profileDomain), { value: null, dropped: 'scheme' });
  assert.deepEqual(cleanWebsite('', profileDomain), { value: null, dropped: 'empty' });
});

test('founded accepts plausible four-digit years only', () => {
  assert.equal(parseFounded('2016', 2026), 2016);
  assert.equal(parseFounded('1', 2026), null);
  assert.equal(parseFounded('20', 2026), null);
  assert.equal(parseFounded('1850', 2026), null);
  assert.equal(parseFounded('2031', 2026), null);
});

test('upstream error literals are treated as empty', () => {
  assert.equal(cleanText('  undefined '), null);
  assert.equal(cleanText('[object Object]'), null);
  assert.equal(cleanText('  Web   Development '), 'Web Development');
  // Links are no specialty; only the website field holds one.
  assert.deepEqual(cleanSpecialties('https://www.instagram.com/acme/ and https://www.tiktok.com/@acme'), { value: null, linksDropped: true });
  assert.deepEqual(cleanSpecialties('SEO, www.acme.com, Web Development'), { value: 'SEO, Web Development', linksDropped: true });
  assert.deepEqual(cleanSpecialties('SEO,Web Development'), { value: 'SEO,Web Development', linksDropped: false });
});

test('page interface text is recognised in names and industries', () => {
  assert.equal(isInterfaceText('0 notifications'), true);
  assert.equal(isInterfaceText('Skip to main content'), true);
  assert.equal(isInterfaceText('Notifications Hub'), false);
});
