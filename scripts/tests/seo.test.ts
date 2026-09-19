import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DESCRIPTION_MAX, DESCRIPTION_MIN, MIN_INDEXED, SITE_URL, TITLE_MAX, absoluteUrl, fitTitle, jsonLdText, listWords } from '../../lib/site.ts';
import { landings } from '../../lib/landing.ts';
import { breadcrumbData, pageMetadata } from '../../lib/seo.ts';
import { cities, companies } from '../../lib/server-data.ts';

test('a title keeps the site name when it fits, and drops it before dropping words', () => {
  assert.equal(fitTitle(['IT companies in Lahore']), 'IT companies in Lahore | mainquest');
  const long = 'Software houses and IT companies in Islamabad and Rawalpindi';
  assert.equal(fitTitle([long, 'IT companies in Islamabad and Rawalpindi']), long);
  assert.equal(fitTitle([`${long} and more`, 'IT companies in Islamabad and Rawalpindi']), 'IT companies in Islamabad and Rawalpindi | mainquest');
});

test('lists read as a sentence', () => {
  assert.equal(listWords(['Karachi']), 'Karachi');
  assert.equal(listWords(['Karachi', 'Lahore', 'Faisalabad']), 'Karachi, Lahore and Faisalabad');
});

test('structured data cannot close its script tag', () => {
  assert.ok(!jsonLdText({ name: 'A </script><script>x' }).includes('</script>'));
});

test('every page has its own canonical address and preview text', () => {
  const m = pageMetadata({ title: 'T', description: 'D', path: '/companies/lahore' });
  assert.equal(m.alternates?.canonical, `${SITE_URL}/companies/lahore`);
  assert.deepEqual([m.openGraph?.title, m.openGraph?.description, (m.openGraph as { url?: string })?.url], ['T', 'D', `${SITE_URL}/companies/lahore`]);
  assert.deepEqual(pageMetadata({ title: 'T', description: 'D', path: '/x', indexed: false }).robots, { index: false, follow: true });
});

test('breadcrumbs count from one and end at the page', () => {
  const b = breadcrumbData([{ href: '/', label: 'All companies' }], { label: 'Lahore', path: '/companies/lahore' });
  assert.deepEqual(b.itemListElement.map((i) => [i.position, i.item]), [[1, absoluteUrl('/')], [2, `${SITE_URL}/companies/lahore`]]);
});

test('the landing pages cover every city and area, each at one address, within the length rules', () => {
  const pages = landings();
  assert.equal(new Set(pages.map((p) => p.path)).size, pages.length);
  const places = new Set(pages.filter((p) => p.kind === 'hub' || p.kind === 'city').flatMap((p) => p.cities));
  for (const c of cities()) assert.ok(places.has(c.id), `no page for the city ${c.id}`);
  for (const p of pages) {
    assert.ok(p.title.length <= TITLE_MAX, `${p.path}: title "${p.title}"`);
    assert.ok(p.description.length >= DESCRIPTION_MIN && p.description.length <= DESCRIPTION_MAX, `${p.path}: description of ${p.description.length}`);
    assert.equal(p.indexed, p.rows.length >= MIN_INDEXED, p.path);
    if (p.kind === 'area') assert.ok(pages.some((q) => q.path === p.crumbs[p.crumbs.length - 1].href), `${p.path}: its city has no page`);
  }
  const areaRows = pages.filter((p) => p.kind === 'area').reduce((n, p) => n + p.rows.length, 0);
  assert.ok(areaRows > 0 && areaRows <= companies().length * 3);
});
