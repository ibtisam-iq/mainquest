// Looks up coordinates for office addresses, well-known places and city names the hand-kept table
// lacks, and a country for foreign headquarters, using OpenStreetMap Nominatim. Results are stored in
// data/geo/cache.json, which is committed, so each one is looked up once. Only new values are
// requested on later runs, plus any office whose stored result predates the names now kept with it.
//
// Usage: npm run geocode [-- --limit N] [-- --dry-run]

import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadLocalEnv } from './ingest/env.ts';
import { readDelimitedFile } from './ingest/csv.ts';
import { assertHeader, toSourceRow } from './ingest/columns.ts';
import { extractHandle } from './ingest/handle.ts';
import { determineHubs, hqRelation } from './ingest/classify.ts';
import {
  CITY_KEY, CityIndex, HQ_KEY, OFFICE_KEY, PLACE_KEY, PlaceIndex, cityNameCandidates, cleanAddress, fallbackQuery, geocodeText, isDetailedAddress,
  isHit, learnCities, loadCache, precisionOf, serializeCache, splitAddress, type GeoEntry, type GeoHit,
} from './ingest/offices.ts';
import { round5 } from '../lib/geo.ts';
import { clean } from '../lib/text.ts';

loadLocalEnv();

const SOURCE = join(ROOT, 'data/raw/companies.csv');
const CACHE = join(ROOT, 'data/geo/cache.json');
const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'mainquest-geocoder/0.1 (+https://github.com/ibtisam-iq/mainquest)';
const MIN_INTERVAL_MS = 1100;

const args = process.argv.slice(2);
const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;
const dryRun = args.includes('--dry-run');

interface Job {
  key: string;
  queries: string[];
  kind: 'office' | 'hq' | 'place' | 'city';
}

const CITY_TABLE = join(ROOT, 'scripts/ingest/rules/city-centroids.json');
const places = new PlaceIndex(join(ROOT, 'scripts/ingest/rules/places.json'));
const cache = loadCache(CACHE);
const { header, rows } = readDelimitedFile(SOURCE);
assertHeader(header);

// City names the table lacks are looked up first; those already confirmed join the index now.
const handKept = new CityIndex(CITY_TABLE);
const cityNames = rows.flatMap((raw) => { const r = toSourceRow(raw); return cityNameCandidates(r.operatingLocations, r.officeAddress); });
const cities = new CityIndex(CITY_TABLE, learnCities(cityNames, cache, handKept));

const jobs = new Map<string, Job>();
for (const place of places.places) {
  const key = PLACE_KEY(place);
  if (!(key in cache.entries)) jobs.set(key, { key, kind: 'place', queries: [place.query] });
}
for (const name of new Set(cityNames)) {
  if (handKept.mentions(name).length > 0) continue;
  const key = CITY_KEY(name);
  if (!(key in cache.entries) && !jobs.has(key)) jobs.set(key, { key, kind: 'city', queries: [name] });
}
// A stored result must carry its names, or it cannot be checked against the address: an office's own
// lookup counts only through a name the address contains, whether or not a well-known place placed it.
const needsNames = (address: string): boolean => {
  const entry = cache.entries[OFFICE_KEY(address)];
  return isHit(entry) && entry.areas === undefined && precisionOf(entry) !== 'city';
};
for (const raw of rows) {
  const row = toSourceRow(raw);
  const handle = extractHandle(row.profileUrl);
  if (!handle.ok || handle.subpage) continue;
  const hubs = determineHubs(row.operatingLocations, row.officeAddress, row.hq);
  for (const part of splitAddress(row.officeAddress)) {
    const address = cleanAddress(part);
    if (!address || !isDetailedAddress(address) || cities.abroad(address)) continue;
    const key = OFFICE_KEY(address);
    const cityId = cities.choose(address) ?? cities.choose(row.operatingLocations) ?? (hubs.has('twin-cities') ? 'islamabad' : null);
    if (jobs.has(key) || (key in cache.entries && !needsNames(address))) continue;
    const cityLabel = cityId ? cities.centroid(cityId).label : null;
    const second = fallbackQuery(address, cityLabel);
    const first = geocodeText(address);
    jobs.set(key, { key, kind: 'office', queries: second ? [first, second] : [first] });
  }
  if (hqRelation(row.hq) === 'foreign' && row.hq.trim()) {
    const key = HQ_KEY(row.hq);
    if (!(key in cache.entries) && !jobs.has(key)) jobs.set(key, { key, kind: 'hq', queries: [row.hq.trim()] });
  }
}

const pending = [...jobs.values()].slice(0, limit);
const offices = pending.filter((j) => j.kind === 'office').length;
const placeJobs = pending.filter((j) => j.kind === 'place').length;
const cityJobs = pending.filter((j) => j.kind === 'city').length;
console.log(`Cached entries: ${Object.keys(cache.entries).length}`);
console.log(`To look up: ${pending.length} (${offices} office addresses, ${placeJobs} known places, ${cityJobs} city names, ${pending.length - offices - placeJobs - cityJobs} headquarters)`);
console.log(`Estimated time at one request per second: about ${Math.ceil((pending.length * 1.4 * MIN_INTERVAL_MS) / 60000)} minutes`);
if (dryRun || pending.length === 0) process.exit(0);

// Global spacing: no two requests ever start less than MIN_INTERVAL_MS apart, however many are in flight.
let nextSlot = 0;
async function slot(): Promise<void> {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + MIN_INTERVAL_MS;
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
}

async function request(query: string, kind: Job['kind']): Promise<any[] | 'blocked'> {
  // A city name is asked for as a city, so the answer is the town rather than a station or a road named after it.
  const params = new URLSearchParams({ ...(kind === 'city' ? { city: query, country: 'Pakistan' } : { q: query }), format: 'jsonv2', addressdetails: '1', limit: '1', 'accept-language': 'en' });
  if (kind !== 'hq') params.set('countrycodes', 'pk');
  const email = process.env.GEOCODER_CONTACT_EMAIL;
  if (email) params.set('email', email);
  for (let attempt = 1; attempt <= 4; attempt++) {
    await slot();
    try {
      const res = await fetch(`${ENDPOINT}?${params}`, { headers: { 'User-Agent': USER_AGENT } });
      if (res.status === 403) return 'blocked';
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 30000 * attempt));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as any[];
    } catch (err) {
      if (attempt === 4) throw err;
      await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
  }
  return [];
}

// The areas around a result, most specific first, without repeats.
function areaNames(a: Record<string, string | undefined>): string[] {
  return [...new Set([a.neighbourhood, a.residential, a.quarter, a.suburb, a.city_district].filter((n): n is string => typeof n === 'string' && n.trim() !== '').map(clean))];
}

function toEntry(hit: any, q: number): GeoEntry {
  const a = hit.address ?? {};
  return {
    lat: round5(Number(hit.lat)),
    lon: round5(Number(hit.lon)),
    type: String(hit.addresstype ?? hit.type ?? ''),
    cat: String(hit.category ?? hit.class ?? ''),
    area: a.suburb ?? a.neighbourhood ?? a.quarter ?? a.city_district ?? a.residential ?? null,
    place: a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? null,
    cc: a.country_code ? String(a.country_code).toLowerCase() : null,
    country: a.country ?? null,
    q,
    // Names are cleaned like all stored text, which also turns typographic dashes into hyphens.
    name: typeof hit.name === 'string' && hit.name.trim() ? clean(hit.name) : null,
    areas: areaNames(a),
  };
}

function save(): void {
  mkdirSync(join(ROOT, 'data/geo'), { recursive: true });
  writeFileSync(`${CACHE}.tmp`, serializeCache(cache));
  renameSync(`${CACHE}.tmp`, CACHE);
}

let done = 0;
let hits = 0;
process.on('SIGINT', () => {
  save();
  console.log(`\nStopped. Saved ${done} lookups. Run again to continue.`);
  process.exit(0);
});

// Two lookups in flight so network latency does not idle the one-per-second budget.
const WORKERS = 2;
let cursor = 0;
async function worker(): Promise<void> {
  while (cursor < pending.length) {
    const job = pending[cursor++];
    // Take the first street or area result. A city-only result is kept only if nothing better turns up.
    let entry: GeoEntry = { miss: true };
    for (let i = 0; i < job.queries.length; i++) {
      const result = await request(job.queries[i], job.kind);
      if (result === 'blocked') {
        save();
        console.error('The geocoder refused the request (HTTP 403). Saved progress. Stop and check the usage policy before retrying.');
        process.exit(1);
      }
      if (result.length === 0) continue;
      const candidate = toEntry(result[0], i + 1) as GeoHit;
      if (job.kind === 'hq' || job.kind === 'city' || precisionOf(candidate) !== 'city') {
        entry = candidate;
        break;
      }
      if ('miss' in entry) entry = candidate;
    }
    if (!('miss' in entry)) hits++;
    cache.entries[job.key] = entry;
    done++;
    if (done % 25 === 0) {
      save();
      console.log(`${done}/${pending.length} looked up, ${hits} found`);
    }
  }
}
await Promise.all(Array.from({ length: WORKERS }, worker));
save();
console.log(`Done. ${done} looked up, ${hits} found, ${done - hits} not found.`);
