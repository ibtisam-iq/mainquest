// Checks a running copy of the site the way a search engine and a chat app see it (decision 28).
//   npm run build && npm run start -- -p 3100
//   npm run check:seo -- http://localhost:3100
// It reads robots.txt and sitemap.xml, follows every link from page to page, and for each page checks
// the title, description, canonical address, preview tags, structured data and headings. It fetches
// every share picture and checks its size. Pages carry the public address (SITE_URL) in their tags; the
// checker maps it to the address it was given, so a local copy is checked exactly as published.
// Exits with an error when anything is wrong; warnings are printed and do not fail the run.
import { DESCRIPTION_MAX, DESCRIPTION_MIN, SITE_URL, TITLE_MAX } from '../lib/site.ts';

const BASE = (process.argv[2] ?? 'http://localhost:3000').replace(/\/$/, '');
// WhatsApp reads a preview only from a head inside the first 300 KB of the page, and skips pictures
// over 600 KB; other apps are stricter about pictures, so over 300 KB is a warning.
const HEAD_LIMIT = 300_000;
const IMAGE_LIMIT = 600_000;
const IMAGE_WARN = 300_000;

const errors: string[] = [];
const warnings: string[] = [];
const error = (where: string, what: string) => errors.push(`${where}: ${what}`);
const warn = (where: string, what: string) => warnings.push(`${where}: ${what}`);

const toLocal = (url: string) => (url.startsWith(SITE_URL) ? BASE + url.slice(SITE_URL.length) : url);
const pathOf = (url: string) => {
  const u = new URL(url, SITE_URL);
  return u.pathname + u.search;
};
const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const attrs = (tag: string) => Object.fromEntries([...tag.matchAll(/([a-zA-Z:.-]+)="([^"]*)"/g)].map((m) => [m[1].toLowerCase(), decode(m[2])]));

async function get(url: string): Promise<{ status: number; type: string; body: Buffer }> {
  const res = await fetch(toLocal(url), { redirect: 'manual', headers: { 'user-agent': 'mainquest-seo-check' } });
  return { status: res.status, type: res.headers.get('content-type') ?? '', body: Buffer.from(await res.arrayBuffer()) };
}

// Runs jobs a few at a time.
async function each<T>(items: T[], job: (item: T) => Promise<void>, width = 8) {
  let next = 0;
  await Promise.all(Array.from({ length: width }, async () => {
    while (next < items.length) await job(items[next++]);
  }));
}

interface Page {
  path: string;
  status: number;
  title: string;
  description: string;
  canonical: string;
  noindex: boolean;
  meta: Record<string, string>;
  links: string[];
  image: string;
}

function readPage(path: string, status: number, html: string): Page {
  const where = path;
  const headEnd = html.indexOf('</head>');
  if (headEnd < 0) error(where, 'no </head>');
  else if (headEnd > HEAD_LIMIT) error(where, `the head ends at byte ${headEnd}, past the ${HEAD_LIMIT} bytes WhatsApp reads`);
  const head = html.slice(0, Math.max(0, headEnd));
  const body = html.slice(Math.max(0, headEnd));

  const titles = [...head.matchAll(/<title>([^<]*)<\/title>/g)].map((m) => decode(m[1]));
  if (titles.length !== 1) error(where, `${titles.length} title tags`);
  const title = titles[0] ?? '';

  const meta: Record<string, string> = {};
  for (const m of head.matchAll(/<meta\s[^>]*>/g)) {
    const a = attrs(m[0]);
    const key = a.property ?? a.name;
    if (key && a.content !== undefined && !(key in meta)) meta[key] = a.content;
  }
  const canonicals = [...head.matchAll(/<link\s[^>]*>/g)].map((m) => attrs(m[0])).filter((a) => a.rel === 'canonical');
  if (/<html[^>]*\slang="[a-z]{2}/.test(html) === false) error(where, 'no lang on <html>');
  if (!meta.viewport) error(where, 'no viewport tag');

  const links = [...body.matchAll(/<a\s[^>]*href="([^"]*)"/g)].map((m) => decode(m[1]));
  return {
    path,
    status,
    title,
    description: meta.description ?? '',
    canonical: canonicals.length === 1 ? canonicals[0].href : canonicals.length === 0 ? '' : 'MULTIPLE',
    noindex: /noindex/i.test(meta.robots ?? ''),
    meta,
    links,
    image: meta['og:image'] ?? '',
  };
}

function checkIndexable(p: Page, html: string, sitemapUrls: Set<string>) {
  const where = p.path;
  const url = SITE_URL + (p.path === '/' ? '/' : p.path);
  const same = (a: string, b: string) => a.replace(/\/$/, '') === b.replace(/\/$/, '');

  if (!p.title) error(where, 'empty title');
  else if (p.title.length > TITLE_MAX) warn(where, `title is ${p.title.length} characters, over ${TITLE_MAX}: "${p.title}"`);
  if (p.description.length < DESCRIPTION_MIN || p.description.length > DESCRIPTION_MAX) error(where, `description is ${p.description.length} characters, outside ${DESCRIPTION_MIN} to ${DESCRIPTION_MAX}`);
  if (p.canonical === 'MULTIPLE') error(where, 'more than one canonical');
  else if (!same(p.canonical, url)) error(where, `canonical is "${p.canonical}", expected "${url}"`);

  const og = p.meta;
  for (const key of ['og:title', 'og:description', 'og:url', 'og:type', 'og:site_name', 'og:image', 'og:image:width', 'og:image:height', 'og:image:alt', 'twitter:card']) {
    if (!og[key]) error(where, `no ${key}`);
  }
  if (og['og:title'] && og['og:title'] !== p.title) error(where, `og:title "${og['og:title']}" differs from the title`);
  if (og['og:description'] && og['og:description'] !== p.description) error(where, 'og:description differs from the description');
  if (og['og:url'] && !same(og['og:url'], url)) error(where, `og:url is "${og['og:url']}"`);
  if (og['og:image'] && !og['og:image'].startsWith(`${SITE_URL}/`)) error(where, `og:image "${og['og:image']}" is not an absolute address on the site`);
  if (og['twitter:card'] && og['twitter:card'] !== 'summary_large_image') error(where, `twitter:card is ${og['twitter:card']}`);

  const h1 = (html.match(/<h1[\s>]/g) ?? []).length;
  if (h1 !== 1) error(where, `${h1} h1 headings`);

  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  if (blocks.length === 0) error(where, 'no structured data');
  for (const text of blocks) {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text);
    } catch {
      error(where, 'structured data is not valid JSON');
      continue;
    }
    if (data['@context'] !== 'https://schema.org' || typeof data['@type'] !== 'string') error(where, 'structured data without a schema.org @context and @type');
    if (data['@type'] === 'BreadcrumbList') {
      const items = data.itemListElement as { position: number; item: string; name: string }[];
      items.forEach((it, i) => {
        if (it.position !== i + 1) error(where, `breadcrumb ${i + 1} has position ${it.position}`);
        if (!it.name || !it.item?.startsWith(SITE_URL)) error(where, `breadcrumb ${i + 1} has no name or no absolute address`);
      });
      const last = items[items.length - 1]?.item ?? '';
      if (!same(last, url)) error(where, `the last breadcrumb is "${last}", not the page`);
    }
    if (data['@type'] === 'Dataset' && (String(data.description ?? '').length < 50 || !data.name)) error(where, 'a Dataset needs a name and a description of at least 50 characters');
  }
  if (!sitemapUrls.has(url) && !sitemapUrls.has(url.replace(/\/$/, ''))) error(where, 'an indexable page missing from the sitemap');
}

async function main() {
  const started = Date.now();

  // robots.txt
  const robots = await get(`${SITE_URL}/robots.txt`);
  if (robots.status !== 200) error('/robots.txt', `status ${robots.status}`);
  const robotsText = robots.body.toString('utf8');
  if (!robotsText.includes(`Sitemap: ${SITE_URL}/sitemap.xml`)) error('/robots.txt', 'does not name the sitemap');
  const disallowed = [...robotsText.matchAll(/^Disallow:\s*(\S+)/gim)].map((m) => m[1]);
  const blocked = (path: string) => disallowed.some((d) => path.startsWith(d));
  for (const needed of ['/_next/static/x.js', '/data/core.json', '/icon.svg', '/opengraph-image']) {
    if (blocked(needed)) error('/robots.txt', `blocks ${needed}, which crawlers need to draw or preview pages`);
  }

  // sitemap.xml
  const sitemap = await get(`${SITE_URL}/sitemap.xml`);
  if (sitemap.status !== 200 || !sitemap.type.includes('xml')) error('/sitemap.xml', `status ${sitemap.status}, type ${sitemap.type}`);
  const entries = [...sitemap.body.toString('utf8').matchAll(/<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?/g)].map((m) => ({ loc: decode(m[1]), lastmod: m[2] ?? '' }));
  const sitemapUrls = new Set(entries.map((e) => e.loc));
  if (sitemapUrls.size !== entries.length) error('/sitemap.xml', 'repeats an address');
  // The local date, as the ingest writes it: a UTC date is still yesterday for five hours after midnight in Pakistan.
  const today = new Date().toLocaleDateString('en-CA');
  for (const e of entries) {
    if (!e.loc.startsWith(`${SITE_URL}/`) && e.loc !== SITE_URL) error('/sitemap.xml', `${e.loc} is not on ${SITE_URL}`);
    if (!/^\d{4}-\d{2}-\d{2}/.test(e.lastmod) || e.lastmod.slice(0, 10) > today) error('/sitemap.xml', `${e.loc} has lastmod "${e.lastmod}"`);
    if (blocked(pathOf(e.loc))) error('/sitemap.xml', `${e.loc} is blocked by robots.txt`);
  }

  // Every page, starting from the sitemap and following links.
  const pages = new Map<string, Page>();
  const html = new Map<string, string>();
  const linkedFrom = new Map<string, Set<string>>();
  let queue = ['/', ...entries.map((e) => pathOf(e.loc))];
  const seen = new Set(queue);
  while (queue.length) {
    const batch = queue;
    queue = [];
    await each(batch, async (path) => {
      const res = await get(SITE_URL + path);
      if (res.status !== 200) {
        error(path, `status ${res.status}${linkedFrom.has(path) ? `, linked from ${[...linkedFrom.get(path)!].slice(0, 3).join(', ')}` : ''}`);
        return;
      }
      if (!res.type.includes('text/html')) {
        error(path, `type ${res.type}`);
        return;
      }
      const text = res.body.toString('utf8');
      const page = readPage(path, res.status, text);
      pages.set(path, page);
      html.set(path, text);
      for (const href of page.links) {
        if (!(href.startsWith('/') && !href.startsWith('//')) && !href.startsWith(SITE_URL)) continue;
        const target = pathOf(href.split('#')[0]);
        // The directory's filter addresses are one page, closed to crawlers by robots.txt.
        if (target.includes('?')) {
          if (!blocked(target)) error(path, `links to ${target}, a filter address robots.txt leaves open`);
          continue;
        }
        if (!linkedFrom.has(target)) linkedFrom.set(target, new Set());
        if (target !== path) linkedFrom.get(target)!.add(path);
        if (!seen.has(target)) {
          seen.add(target);
          queue.push(target);
        }
      }
    });
  }

  const indexable = [...pages.values()].filter((p) => !p.noindex);
  for (const p of pages.values()) {
    if (p.noindex) {
      if (sitemapUrls.has(SITE_URL + p.path)) error(p.path, 'kept out of search results but listed in the sitemap');
      continue;
    }
    checkIndexable(p, html.get(p.path)!, sitemapUrls);
  }
  for (const e of entries) {
    const path = pathOf(e.loc);
    if (path !== '/' && !(linkedFrom.get(path)?.size)) error(path, 'in the sitemap but linked from no other page');
  }
  for (const field of ['title', 'description'] as const) {
    const by = new Map<string, string[]>();
    for (const p of indexable) by.set(p[field], [...(by.get(p[field]) ?? []), p.path]);
    for (const [value, paths] of by) if (paths.length > 1) error(paths.join(', '), `share the ${field} "${value}"`);
  }

  // Share pictures.
  const images = [...new Set(indexable.map((p) => p.image).filter(Boolean))];
  await each(images, async (url) => {
    const res = await get(url);
    const where = pathOf(url);
    if (res.status !== 200 || res.type !== 'image/png') {
      error(where, `status ${res.status}, type ${res.type}`);
      return;
    }
    if (res.body.length > IMAGE_LIMIT) error(where, `${res.body.length} bytes, over WhatsApp's ${IMAGE_LIMIT}`);
    else if (res.body.length > IMAGE_WARN) warn(where, `${res.body.length} bytes`);
    const width = res.body.readUInt32BE(16);
    const height = res.body.readUInt32BE(20);
    if (width !== 1200 || height !== 630) error(where, `${width} by ${height}, not 1200 by 630`);
  });
  for (const p of indexable) {
    if (p.meta['og:image:width'] !== '1200' || p.meta['og:image:height'] !== '630') error(p.path, 'og:image size tags are not 1200 by 630');
  }

  // An address with no page answers 404 and is kept out of search results.
  const missing = await get(`${SITE_URL}/no-such-page-here`);
  if (missing.status !== 404) error('/no-such-page-here', `status ${missing.status}, expected 404`);
  else if (!/<meta name="robots" content="[^"]*noindex/.test(missing.body.toString('utf8'))) error('/no-such-page-here', 'the 404 page is not marked noindex');

  const sample = ['/', indexable.find((p) => p.path.startsWith('/companies/'))?.path, indexable.find((p) => p.path.startsWith('/industry/'))?.path].filter(Boolean) as string[];
  console.log(`Checked ${BASE}: ${pages.size} pages (${indexable.length} for search results, ${pages.size - indexable.length} kept out), ${entries.length} in the sitemap, ${images.length} share pictures, in ${((Date.now() - started) / 1000).toFixed(1)} s.`);
  console.log('\nWhat a chat preview shows for a few pages:');
  for (const path of sample) {
    const p = pages.get(path)!;
    console.log(`  ${path}\n    ${p.meta['og:title']}\n    ${p.meta['og:description']}\n    ${new URL(SITE_URL).host}`);
  }
  if (warnings.length) console.log(`\n${warnings.length} warnings:\n  ${warnings.slice(0, 40).join('\n  ')}`);
  if (errors.length) {
    console.error(`\n${errors.length} errors:\n  ${errors.slice(0, 60).join('\n  ')}`);
    process.exit(1);
  }
  console.log('\nNo errors.');
}

main().catch((e) => {
  console.error(`Could not check ${BASE}: ${e.message}. Is the site running there?`);
  process.exit(1);
});
