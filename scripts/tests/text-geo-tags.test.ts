import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareAscii, fold, slugify } from '../../lib/text.ts';
import { haversineKm, insidePakistan } from '../../lib/geo.ts';
import { TagBuilder } from '../ingest/tags.ts';
import { splitSpecialties } from '../../lib/specialties.ts';

test('folding removes accents and styled letters, and sorting is code-unit order', () => {
  assert.equal(fold('Karāchi'), 'karachi');
  assert.equal(fold('𝐁𝐮𝐬𝐢𝐧𝐞𝐬𝐬'), 'business');
  assert.equal(slugify('IT Services & IT Consulting'), 'it-services-it-consulting');
  assert.deepEqual(['b', 'B', 'a'].sort(compareAscii), ['B', 'a', 'b']);
});

test('haversine: one degree of latitude is about 111.2 km', () => {
  assert.ok(Math.abs(haversineKm(33, 73, 34, 73) - 111.2) < 0.1);
  assert.equal(insidePakistan(33.69, 73.06), true);
  assert.equal(insidePakistan(25.2, 55.3), false);
});

test('specialties split into tags; rare tags stay out of the facet', () => {
  assert.deepEqual(splitSpecialties('Web Development, SEO, and OutSourcing.'), ['Web Development', 'SEO', 'OutSourcing']);
  const tags = new TagBuilder({ 'web-dev': 'web-development' });
  for (let i = 0; i < 5; i++) tags.add(`c${i}`, 'Web Development, SEO');
  tags.add('c5', 'Web Dev, Rare Thing');
  const facet = tags.facet();
  assert.deepEqual(facet.map((f) => [f.id, f.count]), [['web-development', 6], ['seo', 5]]);
});

test('stored text uses plain hyphens and drops replacement characters', async () => {
  const { clean } = await import('../../lib/text.ts');
  assert.equal(clean('Acme \u2014 Labs \u2013 Karachi \uFFFD'), 'Acme - Labs - Karachi');
  assert.equal(clean('\u200Borganix'), 'organix');
});
