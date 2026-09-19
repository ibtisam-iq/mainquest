// Checks the committed dataset. Reads only data/, never the source file, so it also runs on the host
// before every build. Every failure is loud and stops the build.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { ROOT, loadLocalEnv, platformTerm, profileDomain, registrableDomain } from './ingest/env.ts';
import { compareAscii } from '../lib/text.ts';
import { sha256Hex } from './ingest/serialize.ts';
import { OFFICE_FIELDS, ORIGINS, ORIGIN_BASES, PUBLISHED_FIELDS, type CompanyRecord } from '../lib/types.ts';
import { insidePakistan } from '../lib/geo.ts';
import { splitPayload } from '../lib/payload.ts';
import { CityIndex, agreementText } from './ingest/offices.ts';

loadLocalEnv();
const DATA = join(ROOT, 'data');
const read = (file: string) => readFileSync(join(DATA, file), 'utf8');
const json = (file: string) => JSON.parse(read(file));
const baseline = JSON.parse(readFileSync(join(ROOT, 'scripts/ingest/rules/baseline.json'), 'utf8'));

const failures: string[] = [];
const fail = (message: string) => failures.push(message);

const companiesText = read('companies.json');
const records: CompanyRecord[] = JSON.parse(companiesText);
const meta = json('meta.json');
const report = json('ingest-report.json');
const ids = (file: string) => new Set<string>(json(file).map((f: { id: string }) => f.id));
const facets = { hubs: ids('hubs.json'), industries: ids('industries.json'), tags: ids('tags.json'), areas: ids('areas.json'), cities: ids('cities.json'), countries: ids('countries.json') };
const domain = profileDomain();
const term = new RegExp(platformTerm(), 'i');
const URL_SHAPE = /https?:\/\/|www\.[a-z0-9-]+\./i;
const ERROR_LITERALS = new Set(['undefined', 'null', 'none', 'nan', '[object object]', 'error', 'timeout']);
const year = new Date().getFullYear();
// For the location rules (decision 25): the hand-kept city table, the well-known places, and the areas
// whose labels are set by hand, which need not appear word for word in an address.
const RULES = join(ROOT, 'scripts/ingest/rules');
const handKeptCities = new CityIndex(join(RULES, 'city-centroids.json'));
const placeIds = new Set<string>(JSON.parse(readFileSync(join(RULES, 'places.json'), 'utf8')).places.map((p: { id: string }) => p.id));
const areaRules = JSON.parse(readFileSync(join(RULES, 'area-aliases.json'), 'utf8'));
const handLabelled = new Set<string>([...Object.values(areaRules.aliases as Record<string, string>), ...Object.keys(areaRules.labels)]);
// Where companies are run from (decision 27).
const originRules = JSON.parse(readFileSync(join(RULES, 'origin.json'), 'utf8'));
const originFacet = json('origins.json');
const areaLabel = new Map<string, string>(json('areas.json').map((a: { id: string; label: string }) => [a.id, a.label]));
const todayIso = new Date().toLocaleDateString('en-CA');

// 1. File format and integrity.
if (companiesText.charCodeAt(0) === 0xfeff) fail('companies.json starts with a byte order mark.');
if (companiesText.includes('\r')) fail('companies.json contains carriage returns.');
if (!companiesText.endsWith(']\n') || companiesText.endsWith('\n\n')) fail('companies.json must end with exactly one newline.');
if (meta.contentHash !== sha256Hex(companiesText)) fail('meta.json contentHash does not match companies.json.');
if (meta.recordCount !== records.length) fail(`meta.json recordCount ${meta.recordCount} differs from ${records.length} records.`);

// 2. Shape, keys and ordering.
const seen = new Set<string>();
let previous = '';
const idOwner = new Map<string, string>();
records.forEach((r, i) => {
  const at = `record ${i} (${r.handle})`;
  const keys = Object.keys(r);
  if (keys.join() !== PUBLISHED_FIELDS.join()) fail(`${at}: keys are [${keys}], expected [${PUBLISHED_FIELDS}].`);
  if (!r.handle || seen.has(r.handle)) fail(`${at}: missing or duplicate handle.`);
  if (!/^[A-Za-z0-9._~!*'()%-]+$/.test(r.handle)) fail(`${at}: handle is not in URL-encoded ASCII form.`);
  if (i > 0 && compareAscii(previous, r.handle) >= 0) fail(`${at}: handles are not in ascending order.`);
  seen.add(r.handle);
  previous = r.handle;

  // 3. Enumerations, ranges and references.
  if (r.hq !== 'local' && r.hq !== 'foreign') fail(`${at}: hq is "${r.hq}".`);
  if (!ORIGINS.includes(r.origin)) fail(`${at}: origin is "${r.origin}".`);
  if (!ORIGIN_BASES.includes(r.originBasis)) fail(`${at}: originBasis is "${r.originBasis}".`);
  // A company at home has its headquarters at home, and only then, unless settled by hand.
  if (r.originBasis !== 'owner' && (r.origin === 'local') !== (r.hqCountry === originRules.home)) fail(`${at}: origin "${r.origin}" with a headquarters country of "${r.hqCountry}".`);
  if (r.originBasis !== 'owner' && (r.origin === 'local') !== (r.originBasis === 'headquarters')) fail(`${at}: origin "${r.origin}" rests on "${r.originBasis}".`);
  if (typeof r.multiCity !== 'boolean') fail(`${at}: multiCity is not a boolean.`);
  if (r.founded !== null && (!Number.isInteger(r.founded) || r.founded < 1900 || r.founded > year)) fail(`${at}: founded ${r.founded} out of range.`);
  if (r.followers !== null && (!Number.isInteger(r.followers) || r.followers < 0)) fail(`${at}: followers ${r.followers} is not a whole number.`);
  if ((r.followers === null) !== (r.followersAsOf === null)) fail(`${at}: a follower count must carry the date it was counted, and only then.`);
  if (r.companyId !== null && !/^[1-9]\d{0,11}$/.test(r.companyId)) fail(`${at}: companyId "${r.companyId}" is not a numeric id.`);
  if (r.companyId !== null) {
    const other = idOwner.get(r.companyId);
    if (other) fail(`${at}: companyId ${r.companyId} is also ${other}'s. One of them was probably read from another company on the same page.`);
    idOwner.set(r.companyId, r.handle);
  }
  if (r.members !== null && (!Number.isInteger(r.members) || r.members < 0)) fail(`${at}: members ${r.members} is not a whole number.`);
  if ((r.members === null) !== (r.membersAsOf === null)) fail(`${at}: an associated members count must carry the date it was recorded, and only then.`);
  for (const [field, value] of [['followersAsOf', r.followersAsOf], ['membersAsOf', r.membersAsOf], ['updated', r.updated]] as const) {
    if (value !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value > todayIso)) fail(`${at}: ${field} "${value}" is not a past or present date.`);
  }
  if (!r.updated) fail(`${at}: no updated date.`);
  if (!facets.industries.has(r.industry)) fail(`${at}: industry "${r.industry}" missing from industries.json.`);
  if (r.hubs.length === 0) fail(`${at}: no hub.`);
  for (const h of r.hubs) if (!facets.hubs.has(h)) fail(`${at}: hub "${h}" missing from hubs.json.`);
  for (const t of r.tags) if (!facets.tags.has(t)) fail(`${at}: tag "${t}" missing from tags.json.`);
  if (r.hqCountry !== null && !facets.countries.has(r.hqCountry)) fail(`${at}: country "${r.hqCountry}" missing from countries.json.`);
  if (r.offices.length === 0 && r.hubs.join() !== 'other-cities') fail(`${at}: no office, yet the company sits in a named city hub.`);
  for (const o of r.offices) {
    if (Object.keys(o).join() !== OFFICE_FIELDS.join()) fail(`${at}: office keys are [${Object.keys(o)}].`);
    if (!['street', 'area', 'city'].includes(o.precision)) fail(`${at}: office precision "${o.precision}".`);
    if (!insidePakistan(o.lat, o.lon)) fail(`${at}: office at ${o.lat},${o.lon} is outside Pakistan.`);
    if (!facets.cities.has(o.city)) fail(`${at}: office city "${o.city}" missing from cities.json.`);
    if (o.area !== null && !facets.areas.has(o.area)) fail(`${at}: office area "${o.area}" missing from areas.json.`);
    if (o.address !== null && term.test(o.address)) fail(`${at}: an office address names the source platform.`);
    if (o.address !== null && URL_SHAPE.test(o.address)) fail(`${at}: an office address contains a URL.`);
    // An office sits in a city its address names, and an area found by the geocoder is one its address names.
    if (o.address !== null) {
      const named = handKeptCities.mentions(o.address);
      if (named.length > 0 && handKeptCities.entries[o.city] && !named.includes(o.city)) fail(`${at}: office filed under ${o.city}, but its address names ${named.join(', ')}.`);
      if (o.area !== null && !placeIds.has(o.area) && !handLabelled.has(o.area)) {
        const label = areaLabel.get(o.area) ?? o.area;
        if (!agreementText(o.address).includes(agreementText(label))) fail(`${at}: area "${label}" is not named in its address.`);
      }
    }
  }

  // 4. Links: only the website field may hold a URL, and never one on the profile host.
  if (r.website !== null) {
    let host = '';
    try {
      const u = new URL(r.website);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') fail(`${at}: website is not http(s).`);
      host = u.hostname;
    } catch {
      fail(`${at}: website is not a valid URL.`);
    }
    if (host && registrableDomain(host) === domain) fail(`${at}: website points at the profile host.`);
    if (/[?&](utm_|fbclid|gclid)/i.test(r.website)) fail(`${at}: website still carries tracking parameters.`);
  }
  // A company may be named after its domain ("www.example.org"), but no field other than website holds a link.
  if (/https?:\/\//i.test(r.name)) fail(`${at}: the name contains a link.`);
  for (const value of [r.industry, r.specialties ?? '', ...r.tags]) {
    if (URL_SHAPE.test(value)) fail(`${at}: a URL appears outside the website field.`);
  }
  for (const value of [r.name, r.industry, r.specialties ?? '', ...r.tags]) {
    if (ERROR_LITERALS.has(value.trim().toLowerCase())) fail(`${at}: an upstream error value "${value}" was published.`);
  }
  if ('tagline' in r || 'description' in r) fail(`${at}: carries an excluded field.`);
});

// Every company settled by hand is in the dataset, and the filter lists every kind.
for (const handle of Object.keys(originRules.companies)) if (!seen.has(handle)) fail(`rules/origin.json settles "${handle}", which is not in the dataset.`);
if (originFacet.values?.map((v: { id: string }) => v.id).join() !== ORIGINS.join()) fail('data/origins.json does not list every kind of company in order.');

// 5. Counts against the baseline, and coverage that may only grow.
const within = (label: string, actual: number, expected: number, tolerance: number) => {
  if (Math.abs(actual - expected) > expected * tolerance) fail(`${label} is ${actual}, baseline ${expected} (tolerance ${tolerance * 100}%). If the change is intended, update scripts/ingest/rules/baseline.json in the same commit.`);
};
const count = (f: (r: CompanyRecord) => boolean) => records.filter(f).length;
within('Published companies', records.length, baseline.counts.published, baseline.tolerance);
within('Local headquarters', count((r) => r.hq === 'local'), baseline.counts.local, baseline.tolerance);
within('Multi-city companies', count((r) => r.multiCity), baseline.counts.multiCity, baseline.tolerance);
for (const [hub, expected] of Object.entries(baseline.counts.hubs as Record<string, number>)) within(`Hub ${hub}`, count((r) => r.hubs.includes(hub)), expected, baseline.tolerance);

const floors: Record<string, number> = {
  website: count((r) => r.website !== null),
  founded: count((r) => r.founded !== null),
  specialties: count((r) => r.specialties !== null),
  followers: count((r) => r.followers !== null),
  members: count((r) => r.members !== null),
  companyId: count((r) => r.companyId !== null),
  companiesWithStreetOrArea: count((r) => r.offices.some((o) => o.precision !== 'city')),
};
for (const [field, floor] of Object.entries(baseline.coverageFloors as Record<string, number>)) {
  if (floors[field] < floor) fail(`Coverage of ${field} fell to ${floors[field]}, below the floor of ${floor}. Enrichment only adds, so a drop means data was lost.`);
}

const unlocated = count((r) => r.offices.length === 0);
if (unlocated > baseline.unlocatedCeiling) fail(`${unlocated} companies have no locatable city, above the reviewed ceiling of ${baseline.unlocatedCeiling}.`);

// 6. Mentions of the source platform inside text the companies wrote themselves: counted, never printed.
const mentions = {
  handle: count((r) => term.test(r.handle)),
  name: count((r) => term.test(r.name)),
  specialties: count((r) => r.specialties !== null && term.test(r.specialties)),
};
for (const [field, ceiling] of Object.entries(baseline.platformMentionCeilings as Record<string, number>)) {
  if (mentions[field as keyof typeof mentions] > ceiling) fail(`${field}: ${mentions[field as keyof typeof mentions]} records name the source platform, above the reviewed ceiling of ${ceiling}. Review them, then raise the ceiling.`);
}

// 7. Payload size, the constraint the whole browser-side design rests on.
const { core, extra } = splitPayload(records);
const coreBytes = gzipSync(JSON.stringify(core), { level: 9 }).length;
const extraBytes = gzipSync(JSON.stringify(extra), { level: 9 }).length;
if (coreBytes > baseline.budgets.coreGzipBytes) fail(`core payload is ${coreBytes} bytes gzipped, over the ${baseline.budgets.coreGzipBytes} budget.`);
if (extraBytes > baseline.budgets.extraGzipBytes) fail(`extra payload is ${extraBytes} bytes gzipped, over the ${baseline.budgets.extraGzipBytes} budget.`);

// 8. The raw source must never be tracked by git.
if (existsSync(join(ROOT, '.git'))) {
  try {
    const tracked = execFileSync('git', ['ls-files', 'data/raw'], { cwd: ROOT, encoding: 'utf8' }).trim();
    if (tracked) fail('Files under data/raw/ are tracked by git. Remove them from the index before committing.');
  } catch {
    // git unavailable in this environment; the check is skipped.
  }
}

if (report.published !== records.length) fail('ingest-report.json is out of date with companies.json. Re-run npm run ingest.');

const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;
if (failures.length) {
  console.error(`Validation failed with ${failures.length} problem(s):`);
  for (const f of failures.slice(0, 50)) console.error(`  - ${f}`);
  if (failures.length > 50) console.error(`  ... and ${failures.length - 50} more`);
  process.exit(1);
}
console.log(`Valid: ${records.length} companies. Payload gzipped: core ${kb(coreBytes)}, extra ${kb(extraBytes)}. Coverage ${JSON.stringify(floors)}.`);
