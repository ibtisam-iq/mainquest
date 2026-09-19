// Every landing page the site builds, in one list (decision 28): one per city hub, per city a hub does not
// stand for on its own, per area and per industry. The pages, their share pictures, the sitemap, the
// index of places and the checks all read this list, so a page can never be in one and missing from
// another. Every entry comes from the data files, so a new city, area or industry gets a page at the
// next build with no code change.
import type { CompanyRecord } from './types.ts';
import type { Constellation } from './constellation.ts';
import { areas, cities, companies, countryConstellation, hubs, industries, origins, placeConstellation, tags, topCounts } from './server-data.ts';
import { hubTitle } from './hub-label.ts';
import { DESCRIPTION_MAX, MIN_INDEXED, fitTitle, listWords } from './site.ts';

export type LandingKind = 'hub' | 'city' | 'area' | 'industry';

export interface Crumb {
  href: string;
  label: string;
}

export interface Landing {
  kind: LandingKind;
  id: string;
  path: string;
  // The place or industry as it reads in a sentence ("Blue Area, Islamabad"), and as a breadcrumb ("Blue Area").
  name: string;
  short: string;
  heading: string;
  title: string;
  description: string;
  // The pages above this one, starting with the directory.
  crumbs: Crumb[];
  rows: CompanyRecord[];
  // Pages under MIN_INDEXED companies are kept out of search results and the sitemap.
  indexed: boolean;
  // The most recent day any company on the page changed.
  updated: string;
  // The directory, filtered to this page's companies, and what its button says.
  browse: string;
  browseLabel: string;
  // The cities the page stands for, for which office a row shows and for the map; empty for an industry.
  cities: string[];
  // Set on an area's page: the area's id.
  area?: string;
}

const fmt = (n: number) => n.toLocaleString('en');
const companiesWord = (n: number, what = 'IT') => `${fmt(n)} ${what} ${n === 1 ? 'company' : 'companies'}`;
// "3,496 IT companies and software houses", or "1 IT company".
const itCompanies = (n: number) => (n === 1 ? '1 IT company' : `${fmt(n)} IT companies and software houses`);

// Whole sentences, in order, each added if the description still fits with it.
function describe(sentences: readonly string[]): string {
  let out = '';
  for (const s of sentences) {
    const next = out ? `${out} ${s}` : s;
    if (next.length > DESCRIPTION_MAX) continue;
    out = next;
  }
  return out || sentences[0];
}

const latest = (rows: readonly CompanyRecord[]) => rows.reduce((d, r) => (r.updated > d ? r.updated : d), '');

const HOME: Crumb = { href: '/', label: 'All companies' };

let memo: { source: CompanyRecord[]; pages: Landing[] } | null = null;

export function landings(): Landing[] {
  const all = companies();
  if (memo?.source === all) return memo.pages;

  const hubList = hubs();
  const cityList = cities();
  const areaList = areas();
  const tagLabel = new Map(tags().map((t) => [t.id, t.label]));
  const areaLabel = new Map(areaList.map((a) => [a.id, a.label]));
  const cityLabel = new Map(cityList.map((c) => [c.id, c.label]));
  const home = origins().homeName;
  const named = hubList.filter((h) => h.cities.length > 0);
  const rest = hubList.find((h) => h.cities.length === 0);
  const topTags = (rows: readonly CompanyRecord[]) => topCounts(rows.flatMap((r) => r.tags), 3).map(([id]) => tagLabel.get(id) ?? id);
  const pages: Landing[] = [];

  // A city a hub stands for on its own ("lahore") is that hub's page; any other city has a page of its own.
  const soleHub = new Map(named.filter((h) => h.cities.length === 1).map((h) => [h.cities[0], h]));
  for (const c of cityList) {
    const clash = hubList.find((h) => h.id === c.id);
    if (clash && soleHub.get(c.id) !== clash) throw new Error(`City "${c.id}" has the same id as a hub that is not that city alone; the two pages would share one address.`);
  }
  const placePath = (city: string) => `/companies/${soleHub.get(city)?.id ?? city}`;
  const parentHub = (city: string) => named.find((h) => h.cities.includes(city) && h.cities.length > 1);

  for (const h of hubList) {
    const rows = all.filter((r) => r.hubs.includes(h.id));
    const own = h.cities;
    const isRest = own.length === 0;
    const name = isRest ? `${h.place} of ${home}` : h.place;
    const topAreas = topCounts(rows.flatMap((r) => [...new Set(r.offices.flatMap((o) => (o.area && own.includes(o.city) ? [o.area] : [])))]), 3).map(([id]) => areaLabel.get(id) ?? id);
    const officeCities = topCounts(rows.flatMap((r) => [...new Set(r.offices.map((o) => o.city))]), 4).map(([id]) => cityLabel.get(id) ?? id);
    pages.push({
      kind: 'hub',
      id: h.id,
      path: `/companies/${h.id}`,
      name,
      short: hubTitle(h.label),
      heading: `IT companies in ${h.place}`,
      title: fitTitle(isRest ? [`IT companies in ${name}`] : [`Software houses and IT companies in ${name}`, `IT companies in ${name}`]),
      description: describe(isRest
        ? [`${companiesWord(rows.length)} whose listed location names none of ${listWords(named.map((n) => n.place))}.`, officeCities.length ? `Offices placed in ${listWords(officeCities)}.` : '', 'Each listed with its specialties, website and offices.'].filter(Boolean)
        : [`${itCompanies(rows.length)} in ${name}.`, topAreas.length ? `Busiest areas: ${listWords(topAreas)}.` : '', 'Each listed with its specialties, website and offices.'].filter(Boolean)),
      crumbs: [HOME],
      rows,
      indexed: rows.length >= MIN_INDEXED,
      updated: latest(rows),
      browse: `/?city=${h.id}`,
      browseLabel: `Browse all ${fmt(rows.length)} in the directory`,
      cities: own,
    });
  }

  for (const c of cityList) {
    if (soleHub.has(c.id)) continue;
    const rows = all.filter((r) => r.offices.some((o) => o.city === c.id));
    const parent = parentHub(c.id);
    const topAreas = topCounts(rows.flatMap((r) => [...new Set(r.offices.flatMap((o) => (o.area && o.city === c.id ? [o.area] : [])))]), 3).map(([id]) => areaLabel.get(id) ?? id);
    const tagsHere = topTags(rows);
    pages.push({
      kind: 'city',
      id: c.id,
      path: `/companies/${c.id}`,
      name: c.label,
      short: c.label,
      heading: `IT companies in ${c.label}`,
      title: fitTitle([`Software houses and IT companies in ${c.label}`, `IT companies in ${c.label}`]),
      description: describe([
        `${itCompanies(rows.length)} with an office in ${c.label}.`,
        topAreas.length ? `Busiest areas: ${listWords(topAreas)}.` : tagsHere.length ? `Common specialties: ${listWords(tagsHere)}.` : '',
        'Each listed with its specialties, website and offices.',
      ].filter(Boolean)),
      crumbs: parent ? [HOME, { href: `/companies/${parent.id}`, label: hubTitle(parent.label) }] : [HOME],
      rows,
      indexed: rows.length >= MIN_INDEXED,
      updated: latest(rows),
      browse: `/?in=${c.id}`,
      browseLabel: `Browse all ${fmt(rows.length)} in the directory`,
      cities: [c.id],
    });
  }

  for (const a of areaList) {
    const [city, slug] = a.id.split(':');
    const label = cityLabel.get(city);
    if (!slug || !label) throw new Error(`Area "${a.id}" does not name a city from cities.json.`);
    const rows = all.filter((r) => r.offices.some((o) => o.area === a.id));
    const parent = parentHub(city);
    const tagsHere = topTags(rows);
    const name = `${a.label}, ${label}`;
    pages.push({
      kind: 'area',
      id: a.id,
      path: `${placePath(city)}/${slug}`,
      name,
      short: a.label,
      heading: `IT companies in ${name}`,
      title: fitTitle([`Software houses and IT companies in ${name}`, `IT companies in ${name}`, `IT companies in ${a.label}`]),
      description: describe([
        `${itCompanies(rows.length)} with an office in ${name}.`,
        tagsHere.length ? `Common specialties: ${listWords(tagsHere)}.` : '',
        'Each listed with its website and offices.',
      ].filter(Boolean)),
      crumbs: [HOME, ...(parent ? [{ href: `/companies/${parent.id}`, label: hubTitle(parent.label) }] : []), { href: placePath(city), label }],
      rows,
      indexed: rows.length >= MIN_INDEXED,
      updated: latest(rows),
      browse: `/?area=${encodeURIComponent(a.id)}`,
      browseLabel: `Browse all ${fmt(rows.length)} in the directory`,
      cities: [city],
      area: a.id,
    });
  }

  for (const i of industries()) {
    const rows = all.filter((r) => r.industry === i.id);
    const byHub = topCounts(rows.flatMap((r) => r.hubs).filter((h) => h !== rest?.id), 3).map(([id]) => hubTitle(hubList.find((h) => h.id === id)?.label ?? id));
    const tagsHere = topTags(rows);
    pages.push({
      kind: 'industry',
      id: i.id,
      path: `/industry/${i.id}`,
      name: i.label,
      short: i.label,
      heading: `${i.label} companies in ${home}`,
      title: fitTitle([`${i.label} companies in ${home}`, `${i.label} companies`]),
      description: describe([
        `${companiesWord(rows.length, i.label)} in ${home}.`,
        byHub.length > 1 ? `The largest groups are in ${listWords(byHub)}.` : byHub.length === 1 ? `Most are in ${byHub[0]}.` : '',
        tagsHere.length ? `Common specialties: ${listWords(tagsHere)}.` : '',
        'Each listed with its website and offices.',
      ].filter(Boolean)),
      crumbs: [HOME],
      rows,
      indexed: rows.length >= MIN_INDEXED,
      updated: latest(rows),
      browse: `/?industry=${i.id}`,
      browseLabel: `Browse all ${fmt(rows.length)} in the directory`,
      cities: [],
    });
  }

  const seen = new Set<string>();
  for (const p of pages) {
    if (seen.has(p.path)) throw new Error(`Two landing pages share the address ${p.path}.`);
    seen.add(p.path);
  }
  memo = { source: all, pages };
  return pages;
}

export const landingAt = (path: string) => landings().find((p) => p.path === path);
export const landingsOf = (kind: LandingKind) => landings().filter((p) => p.kind === kind);

// A page's dot map, drawn on the page and on its share picture. An industry's covers the country, one dot
// per city. An area's shows its whole city with the area marked, so the reader sees where in the city it is.
export function landingMap(page: Landing, width: number, height: number): Constellation {
  const dot = { minRadius: 2, growth: 1, maxRadius: 8, pad: 26 };
  if (page.kind === 'industry') return countryConstellation(page.rows, width, height);
  const a = page.area ? areas().find((x) => x.id === page.area) : undefined;
  if (a) {
    const cityPage = landingAt(page.crumbs[page.crumbs.length - 1].href);
    return placeConstellation(cityPage?.rows ?? page.rows, page.cities, width, height, true, dot, [{ lat: a.lat, lon: a.lon, label: a.label }]);
  }
  return placeConstellation(page.rows, page.cities.length ? page.cities : undefined, width, height, true, dot);
}

// Up to three of the page's largest groups, for its share picture: areas in a place (specialties where
// none are known), specialties in an area, cities for an industry.
export function landingHighlights(page: Landing, limit = 3): { label: string; count: number }[] {
  const { rows, cities: own } = page;
  const label = (map: Map<string, string>) => ([id, count]: [string, number]) => ({ label: map.get(id) ?? id, count });
  const tagLabels = new Map(tags().map((t) => [t.id, t.label]));
  const byTag = () => topCounts(rows.flatMap((r) => r.tags), limit).map(label(tagLabels));
  if (page.kind === 'industry') {
    const hubLabels = new Map(hubs().map((h) => [h.id, hubTitle(h.label)]));
    return topCounts(rows.flatMap((r) => r.hubs), limit).map(label(hubLabels));
  }
  if (page.kind === 'area') return byTag();
  const inAreas = topCounts(rows.flatMap((r) => [...new Set(r.offices.flatMap((o) => (o.area && own.includes(o.city) ? [o.area] : [])))]), limit);
  return inAreas.length ? inAreas.map(label(new Map(areas().map((x) => [x.id, x.label])))) : byTag();
}
