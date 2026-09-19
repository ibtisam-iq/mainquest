// Builds the published dataset from the copied source file.
// Input:  data/raw/companies.csv (gitignored) and data/geo/cache.json
// Output: data/companies.json plus facet files, all committed.

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadLocalEnv, platformTerm, profileDomain } from './env.ts';
import { readDelimitedFile } from './csv.ts';
import { assertHeader, toSourceRow } from './columns.ts';
import { extractHandle } from './handle.ts';
import { HUBS, determineHubs, hqRelation, hubOfCity, isMultiCity } from './classify.ts';
import { cleanSpecialties, cleanText, cleanWebsite, isInterfaceText, parseCompanyId, parseFollowers, parseFounded, parseIsoDate, parseMembers, sharedIdHandles } from './fields.ts';
import { CityIndex, HQ_KEY, PlaceIndex, buildOffices, cityNameCandidates, isHit, learnCities, loadCache, newOfficeStats, placePoint, type OfficeContext } from './offices.ts';
import { TagBuilder, mostCommon } from './tags.ts';
import { classifyOrigin, loadOriginRules } from './origin.ts';
import { ORIGINS, type Origin, type OriginBasis } from '../../lib/types.ts';
import { buildRecord, resolveRecordedDate, resolveUpdated } from './record.ts';
import { prettyJson, serializeRecords, sha256Hex, writeIfChanged } from './serialize.ts';
import { clean, compareAscii, lookupKey, slugify } from '../../lib/text.ts';
import { printChanges, printSummary, type IngestReport } from './report.ts';
import { round5 } from '../../lib/geo.ts';
import type { CompanyRecord, Facet } from '../../lib/types.ts';

loadLocalEnv();
const domain = profileDomain();
const term = new RegExp(platformTerm(), 'i');

const RULES = join(ROOT, 'scripts/ingest/rules');
const DATA = join(ROOT, 'data');
const SOURCE = join(DATA, 'raw/companies.csv');
const rule = (file: string) => JSON.parse(readFileSync(join(RULES, file), 'utf8'));

if (!existsSync(SOURCE)) {
  console.error('data/raw/companies.csv is missing. Copy the latest master CSV there first.');
  process.exit(1);
}

const industryAliases: Record<string, string> = rule('industry-aliases.json').aliases;
const tagAliases: Record<string, string> = rule('tag-aliases.json').aliases;
const knownIds: Record<string, string> = rule('company-ids.json').ids;
const areaRules: { aliases: Record<string, string>; labels: Record<string, string> } = rule('area-aliases.json');
const places = new PlaceIndex(join(RULES, 'places.json'));
const cache = loadCache(join(DATA, 'geo/cache.json'));
const tags = new TagBuilder(tagAliases);

const { header, rows } = readDelimitedFile(SOURCE);
assertHeader(header);

// The hand-kept city table, plus cities the data names that the geocoder confirmed (npm run geocode).
const handKept = new CityIndex(join(RULES, 'city-centroids.json'));
const learned = learnCities(rows.flatMap((raw) => { const r = toSourceRow(raw); return cityNameCandidates(r.operatingLocations, r.officeAddress); }), cache, handKept);
const cities = new CityIndex(join(RULES, 'city-centroids.json'), learned);
const ctx: OfficeContext = {
  cities, places, cache, areaAliases: areaRules.aliases, areaLabels: new Map(),
  hubCities: Object.fromEntries(HUBS.map((h) => [h.id, h.cities])), cityNames: cities.names(),
};
const stats = newOfficeStats();
const originRules = loadOriginRules(join(RULES, 'origin.json'));
for (const handle of Object.keys(originRules.companies)) if (!/^[a-z0-9%._~!*'()-]+$/.test(handle)) throw new Error(`rules/origin.json names "${handle}", which is not a handle.`);
// Every name for a city in the home country, long enough not to be an abbreviation such as "isb".
const homeCityNames = [...new Set(Object.values(cities.entries).flatMap((c) => [c.label, ...c.keywords, ...(c.neighbourhoods ?? [])]).filter((n) => lookupKey(n).length >= 4))];
const originCounts = new Map<string, number>();

// The previous dataset, so an unchanged company keeps its updated date.
const companiesPath = join(DATA, 'companies.json');
const previous: CompanyRecord[] | null = existsSync(companiesPath) ? JSON.parse(readFileSync(companiesPath, 'utf8')) : null;
const previousByHandle = new Map((previous ?? []).map((r) => [r.handle, r]));
const today = new Date().toLocaleDateString('en-CA');

// The source ends some foreign headquarters with the country's two-letter code ("London, United Kingdom, GB").
// When the lookup finds nothing, the code names the country, unless the text names a Pakistani city, where
// "GB" and "KP" are Gilgit-Baltistan and Khyber Pakhtunkhwa.
const REGION = new Intl.DisplayNames(['en'], { type: 'region' });
function countryCode(hq: string): string | null {
  const code = /,\s*([A-Z]{2})\s*$/.exec(hq)?.[1];
  if (!code || code === 'PK' || cities.mentions(hq).length > 0) return null;
  try { return REGION.of(code) && REGION.of(code) !== code ? code.toLowerCase() : null; } catch { return null; }
}

function tally(map: Map<string, Map<string, number>>, id: string, label: string): void {
  const m = map.get(id) ?? new Map<string, number>();
  m.set(label, (m.get(label) ?? 0) + 1);
  map.set(id, m);
}

const dropped: Record<string, number> = { subpage_capture: 0, no_profile_url: 0, no_company_segment: 0, malformed_handle: 0, missing_name: 0, missing_industry: 0 };
const industryLabels = new Map<string, Map<string, number>>();
const countryLabels = new Map<string, Map<string, number>>();
const unresolvedHq = new Map<string, number>();
const websiteDropped: Record<string, number> = {};
let trackingStripped = 0;
let specialtiesWithLinks = 0;
let foundedRejected = 0;
let foreignResolvedToPakistan = 0;
let namesFromHandle = 0;
const ids = { fromSource: 0, fromKnownList: 0, rejected: 0, shared: [] as string[] };
let industryNotListed = 0;
const year = new Date().getFullYear();
const firstRow = new Map<string, number>();
const drafts: { record: Omit<CompanyRecord, 'updated'>; tagIds: string[]; sourceDate: string | null }[] = [];

rows.forEach((raw, index) => {
  const row = toSourceRow(raw);
  const h = extractHandle(row.profileUrl);
  if (!h.ok) {
    dropped[{ empty: 'no_profile_url', no_company_segment: 'no_company_segment', malformed: 'malformed_handle' }[h.reason]]++;
    return;
  }
  if (h.subpage) {
    dropped.subpage_capture++;
    return;
  }
  // A name with no letter or digit (one company is listed as "------") falls back to its handle.
  let name = cleanText(row.name);
  if (name && (!/[\p{L}\p{N}]/u.test(name) || isInterfaceText(name))) {
    name = decodeURIComponent(h.handle).replace(/[-_]+/g, ' ').trim();
    namesFromHandle++;
  }
  if (!name) return void dropped.missing_name++;
  // A missing industry, or page interface text in its place, is published as "Industry not listed".
  let industryLabel = cleanText(row.industry);
  if (!industryLabel || isInterfaceText(industryLabel)) {
    industryLabel = 'Industry not listed';
    industryNotListed++;
  }
  if (firstRow.has(h.handle)) throw new Error(`Handle "${h.handle}" appears on source rows ${firstRow.get(h.handle)} and ${index + 2}. Resolve it before publishing.`);
  firstRow.set(h.handle, index + 2);

  const hubs = determineHubs(row.operatingLocations, row.officeAddress, row.hq);
  const hq = hqRelation(row.hq);
  const slug = slugify(industryLabel);
  const industry = industryAliases[slug] ?? slug;
  tally(industryLabels, industry, industryLabel);

  const web = cleanWebsite(row.website, domain);
  if (web.value === null && web.dropped !== 'empty') websiteDropped[web.dropped] = (websiteDropped[web.dropped] ?? 0) + 1;
  if (web.value !== null && web.trackingStripped) trackingStripped++;
  const founded = parseFounded(row.founded, year);
  if (founded === null && row.founded.trim()) foundedRejected++;
  const cleanedSpecialties = cleanSpecialties(row.specialties);
  if (cleanedSpecialties.linksDropped) specialtiesWithLinks++;
  const specialties = cleanedSpecialties.value;
  const followers = parseFollowers(row.followerCount);
  const members = parseMembers(row.memberCount);
  // The source's id wins; the hand-kept list only fills companies the source has not reached yet.
  const sourceId = parseCompanyId(row.companyId);
  if (sourceId === null && row.companyId.trim()) ids.rejected++;
  const knownId = knownIds[h.handle] ? parseCompanyId(knownIds[h.handle]) : null;
  if (sourceId && knownId && sourceId !== knownId) throw new Error(`Company id for "${h.handle}" is ${sourceId} in the source and ${knownId} in rules/company-ids.json. Remove or correct the rules entry.`);
  const companyId = sourceId ?? knownId;
  if (sourceId) ids.fromSource++;
  else if (knownId) ids.fromKnownList++;
  const before = previousByHandle.get(h.handle);
  const sourceDate = parseIsoDate(row.trailingDate, today);

  let hqCountry: string | null = 'pk';
  if (hq === 'foreign') {
    const hit = ctx.cache.entries[HQ_KEY(row.hq)];
    hqCountry = isHit(hit) && hit.cc ? hit.cc : countryCode(row.hq);
    if (hqCountry === null) unresolvedHq.set(clean(row.hq), (unresolvedHq.get(clean(row.hq)) ?? 0) + 1);
    else tally(countryLabels, hqCountry, isHit(hit) && hit.country ? hit.country : hqCountry.toUpperCase());
    if (hqCountry === 'pk') foreignResolvedToPakistan++;
  }
  const offices = buildOffices({ officeAddress: row.officeAddress, operatingLocations: row.operatingLocations, headquarters: row.hq, hubs }, ctx, stats);
  const hqHit = hq === 'foreign' ? ctx.cache.entries[HQ_KEY(row.hq)] : undefined;
  const { origin, basis } = classifyOrigin({
    handle: h.handle, hqText: row.hq, hqCountry, hqCountryName: isHit(hqHit) ? hqHit.country : null,
    name, description: row.longText, website: web.value, officeAddresses: offices.flatMap((o) => (o.address ? [o.address] : [])),
  }, originRules, homeCityNames);
  // A headquarters the lookup could not place, but which names a city at home, is at home.
  if (origin === 'local' && basis === 'headquarters' && hqCountry === null) hqCountry = originRules.home;
  originCounts.set(`${origin}/${basis}`, (originCounts.get(`${origin}/${basis}`) ?? 0) + 1);
  if (hqCountry === 'pk') tally(countryLabels, 'pk', 'Pakistan');

  const tagIds = tags.add(h.handle, specialties);
  drafts.push({
    record: { handle: h.handle, companyId, name, industry, hubs: [...hubs].sort(compareAscii), hq, hqCountry, origin, originBasis: basis, multiCity: isMultiCity(row.operatingLocations, hubs), website: web.value, founded, followers, followersAsOf: followers === null ? null : sourceDate, members, membersAsOf: resolveRecordedDate(before?.members, before?.membersAsOf, members, today), tags: [], specialties, offices },
    tagIds,
    sourceDate,
  });
});

for (const [id, labels] of industryLabels) {
  if (labels.size > 1 && !Object.values(industryAliases).includes(id)) throw new Error(`Industry id "${id}" comes from several labels (${[...labels.keys()].join(' | ')}). Add an alias or rename.`);
}

// A company id belongs to one company. Two companies with the same id means one of them was read from
// another company's page, and nothing says which, so neither keeps it: their members links fall back to
// each company's own page of associated members, which is always right (decision 22).
const sharing = sharedIdHandles(drafts.map((d) => d.record));
for (const d of drafts) {
  if (!sharing.has(d.record.handle)) continue;
  ids.shared.push(d.record.handle);
  d.record.companyId = null;
}

const tagFacet = tags.facet();
const keptTags = new Set(tagFacet.map((t) => t.id));
const records = drafts
  .map(({ record, tagIds, sourceDate }) => {
    const built = buildRecord({ ...record, tags: tagIds.filter((t) => keptTags.has(t)).sort(compareAscii), updated: '' });
    const { updated: _placeholder, ...content } = built;
    built.updated = resolveUpdated(previousByHandle.get(built.handle), content, sourceDate, today);
    return built;
  })
  .sort((a, b) => compareAscii(a.handle, b.handle));

// ---------- facets ----------

const byCount = (a: Facet, b: Facet) => b.count - a.count || compareAscii(a.id, b.id);
const countBy = (pick: (r: CompanyRecord) => Iterable<string>) => {
  const m = new Map<string, number>();
  for (const r of records) for (const id of new Set(pick(r))) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
};

const hubCounts = countBy((r) => r.hubs);
const hubFacet = HUBS.map((h) => ({ id: h.id, label: h.label, place: h.place, cities: h.cities, count: hubCounts.get(h.id) ?? 0 }));
const industryFacet = [...countBy((r) => [r.industry])].map(([id, count]) => ({ id, label: mostCommon(industryLabels.get(id)!), count })).sort(byCount);
// The four kinds of company, named from the home country in rules/origin.json, with the sentence each
// piece of evidence gives in a company's details. "{country}" stands for the listed headquarters' country.
const home = originRules.countries[originRules.home];
const ORIGIN_TEXT: Record<Origin, { label: string; row: string }> = {
  local: { label: `${home.adjective} company`, row: '' },
  'registered-abroad': { label: `${home.adjective}, registered abroad`, row: `${home.adjective}, registered in {country}` },
  international: { label: `International, with an office in ${home.name}`, row: 'International, based in {country}' },
  unclear: { label: 'Registered abroad, base unclear', row: 'Headquarters listed in {country}' },
};
const BASIS_TEXT: Record<OriginBasis, string> = {
  headquarters: `Its headquarters is in ${home.name}.`,
  owner: 'Settled by hand, from what is known about the company.',
  'described-here': `Its headquarters is listed in {country}, and its own description says it is based in ${home.name}.`,
  'described-abroad': 'Its own description says it is based in {country}.',
  'registration-address': `Its headquarters is listed at an address where companies are registered without working there, and every office it lists is in ${home.name}.`,
  'company-form': `Its headquarters is listed in {country}, but it uses a ${home.adjective} company form, such as (Pvt) Ltd.`,
  website: `Its headquarters is listed in {country}, but its website ends in ${home.domains[0]}.`,
  'office-label': `Its headquarters is listed in {country}, but it names its office in ${home.name} as its head office.`,
  none: 'Its headquarters is listed in {country}. Nothing else in the data says where it is run from.',
};
const originFacet = {
  home: originRules.home,
  homeName: home.name,
  homeAdjective: home.adjective,
  values: ORIGINS.map((id) => ({ id, ...ORIGIN_TEXT[id], count: records.filter((r) => r.origin === id).length })),
  bases: BASIS_TEXT,
  notes: Object.fromEntries(Object.entries(originRules.companies).map(([handle, c]) => [handle, c.note])),
};

const countryFacet = [...countBy((r) => (r.hqCountry ? [r.hqCountry] : []))].map(([id, count]) => ({ id, label: mostCommon(countryLabels.get(id)!), count })).sort(byCount);

const cityCounts = countBy((r) => r.offices.map((o) => o.city));
const cityFacet = [...cityCounts]
  .map(([id, count]) => ({ id, label: cities.centroid(id).label, count, lat: cities.centroid(id).lat, lon: cities.centroid(id).lon }))
  .sort(byCount);

const areaPoints = new Map<string, { lat: number; lon: number; n: number }>();
for (const r of records) for (const o of r.offices) if (o.area) {
  const p = areaPoints.get(o.area) ?? { lat: 0, lon: 0, n: 0 };
  areaPoints.set(o.area, { lat: p.lat + o.lat, lon: p.lon + o.lon, n: p.n + 1 });
}
const areaCounts = countBy((r) => r.offices.flatMap((o) => (o.area ? [o.area] : [])));
const areaFacet = [...areaCounts]
  .map(([id, count]) => {
    const p = areaPoints.get(id)!;
    const known = places.places.find((pl) => pl.id === id);
    const centre = known ? placePoint(known, ctx.cache, cities) : null;
    const label = areaRules.labels[id] ?? known?.label ?? mostCommon(ctx.areaLabels.get(id)!);
    return { id, label, city: id.split(':')[0], count, lat: round5(centre?.lat ?? p.lat / p.n), lon: round5(centre?.lon ?? p.lon / p.n) };
  })
  .sort(byCount);

// ---------- report ----------

const byPrecision: Record<string, number> = { street: 0, area: 0, city: 0 };
for (const r of records) for (const o of r.offices) byPrecision[o.precision]++;
const count = (f: (r: CompanyRecord) => boolean) => records.filter(f).length;

const report: IngestReport = {
  sourceRows: rows.length,
  published: records.length,
  dropped,
  hubs: Object.fromEntries(hubFacet.map((h) => [h.id, h.count])),
  hq: { local: count((r) => r.hq === 'local'), foreign: count((r) => r.hq === 'foreign'), hqCountryUnresolved: count((r) => r.hqCountry === null), foreignResolvedToPakistan },
  origin: Object.fromEntries([...originCounts].sort((a, b) => compareAscii(a[0], b[0]))),
  multiCity: count((r) => r.multiCity),
  facets: { industries: industryFacet.length, tags: tagFacet.length, areas: areaFacet.length, cities: cityFacet.length, citiesLearned: cityFacet.filter((c) => learned.cities[c.id]).length, countries: countryFacet.length },
  coverage: { website: count((r) => r.website !== null), founded: count((r) => r.founded !== null), specialties: count((r) => r.specialties !== null), tags: count((r) => r.tags.length > 0), followers: count((r) => r.followers !== null), members: count((r) => r.members !== null), companyId: count((r) => r.companyId !== null) },
  companyIds: ids,
  cleaning: { websiteDropped, trackingStripped, specialtiesWithLinks, foundedRejected, namesFromHandle, industryNotListed },
  offices: {
    total: byPrecision.street + byPrecision.area + byPrecision.city,
    byPrecision,
    companiesWithStreetOrArea: count((r) => r.offices.some((o) => o.precision !== 'city')),
    ...stats,
    officeCityOutsideHubs: count((r) => r.offices.some((o) => !r.hubs.includes(hubOfCity(o.city)))),
  },
  platformMentions: {
    handle: count((r) => term.test(r.handle)),
    name: count((r) => term.test(r.name)),
    specialties: count((r) => r.specialties !== null && term.test(r.specialties)),
    address: count((r) => r.offices.some((o) => o.address !== null && term.test(o.address))),
    website: count((r) => r.website !== null && term.test(r.website)),
  },
  unresolvedHeadquarters: [...unresolvedHq].map(([value, n]) => ({ value, count: n })).sort((a, b) => b.count - a.count || compareAscii(a.value, b.value)),
};

// ---------- write ----------

const companiesText = serializeRecords(records);
mkdirSync(DATA, { recursive: true });

const writes: Record<string, string> = {
  'data/companies.json': writeIfChanged(companiesPath, companiesText),
  'data/hubs.json': writeIfChanged(join(DATA, 'hubs.json'), prettyJson(hubFacet)),
  'data/industries.json': writeIfChanged(join(DATA, 'industries.json'), prettyJson(industryFacet)),
  'data/tags.json': writeIfChanged(join(DATA, 'tags.json'), prettyJson(tagFacet)),
  'data/areas.json': writeIfChanged(join(DATA, 'areas.json'), prettyJson(areaFacet)),
  'data/cities.json': writeIfChanged(join(DATA, 'cities.json'), prettyJson(cityFacet)),
  'data/countries.json': writeIfChanged(join(DATA, 'countries.json'), prettyJson(countryFacet)),
  'data/origins.json': writeIfChanged(join(DATA, 'origins.json'), prettyJson(originFacet)),
  'data/meta.json': writeIfChanged(join(DATA, 'meta.json'), prettyJson({ recordCount: records.length, sourceRows: rows.length, dropped, contentHash: sha256Hex(companiesText) })),
  'data/ingest-report.json': writeIfChanged(join(DATA, 'ingest-report.json'), prettyJson(report)),
};

printSummary(report, writes);
printChanges(previous, records);
console.log(`Content hash ${sha256Hex(companiesText)}`);
