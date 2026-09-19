// Build-time access to the committed dataset, for pages rendered on the server.
// Never imported by client components, so the full file never reaches the browser bundle.
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { CompanyRecord, Facet, HubFacet, OriginFacets } from './types.ts';
import { constellation, type Centre, type Constellation } from './constellation.ts';
import { hubTitle } from './hub-label.ts';

const read = <T,>(file: string): T => JSON.parse(readFileSync(join(process.cwd(), 'data', file), 'utf8'));

// Kept in memory between pages, and read again when the file changes, so a running dev server picks
// up a fresh "npm run data" without a restart.
let cache: { mtimeMs: number; companies: CompanyRecord[] } | null = null;

export function companies(): CompanyRecord[] {
  const { mtimeMs } = statSync(join(process.cwd(), 'data', 'companies.json'));
  if (cache?.mtimeMs !== mtimeMs) cache = { mtimeMs, companies: read<CompanyRecord[]>('companies.json') };
  return cache.companies;
}

export const hubs = () => read<HubFacet[]>('hubs.json');

// The cities a hub stands for, or undefined for the catch-all hub, which stands for none in particular.
export function hubCities(hubId: string): string[] | undefined {
  const own = hubs().find((h) => h.id === hubId)?.cities;
  return own && own.length > 0 ? own : undefined;
}
export const industries = () => read<Facet[]>('industries.json');
export const tags = () => read<Facet[]>('tags.json');
export const areas = () => read<(Facet & { city: string; lat: number; lon: number })[]>('areas.json');
export const origins = () => read<OriginFacets>('origins.json');
export const cities = () => read<(Facet & { lat: number; lon: number })[]>('cities.json');

export function topCounts(values: Iterable<string>, limit: number): [string, number][] {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, limit);
}

// The most recent day any record changed, for "Data last changed".
export function latestUpdate(): string {
  return companies().reduce((d, r) => (r.updated > d ? r.updated : d), '');
}

// A hub's office dot map. Offices placed at street or area level in the hub's own cities; a hub with too
// few of those (the catch-all hub) uses every office it has, city centres included, so it still shows
// where its companies are spread. The larger map on a hub's page names its cities.
export function hubConstellation(hubId: string, width: number, height: number, labelled = false, dot = { minRadius: 1.1, growth: 0.75, maxRadius: 5, pad: 8 }): Constellation {
  return placeConstellation(companies().filter((r) => r.hubs.includes(hubId)), hubCities(hubId), width, height, labelled, dot);
}

// The same map for any set of companies in a set of cities (undefined: wherever they are). A marked
// point, such as an area's centre, is drawn and named on top.
export function placeConstellation(rows: readonly CompanyRecord[], own: string[] | undefined, width: number, height: number, labelled = false, dot = { minRadius: 1.1, growth: 0.75, maxRadius: 5, pad: 8 }, marked: Centre[] = []): Constellation {
  const inPlace = (city: string) => !own || own.includes(city);
  let points = rows.flatMap((r) => r.offices.filter((o) => o.precision !== 'city' && inPlace(o.city)));
  const sparse = points.length < 12;
  if (sparse) points = rows.flatMap((r) => r.offices.filter((o) => inPlace(o.city)));
  const centres = cities()
    .filter((c) => (own ? own.includes(c.id) : false))
    .map((c) => ({ lat: c.lat, lon: c.lon, label: labelled && marked.length === 0 ? c.label : undefined }));
  return constellation(points, { width, height, trim: sparse ? 0 : 0.02, bin: sparse ? 0.05 : 0.004, ...dot }, [...centres, ...marked]);
}

// A whole-country dot map of a set of companies: every office, grouped to about 9 km, so each city reads
// as one dot sized by its offices, with the hubs named at their first city.
export function countryConstellation(rows: readonly CompanyRecord[], width: number, height: number): Constellation {
  const points = rows.flatMap((r) => r.offices);
  const where = new Map(cities().map((c) => [c.id, c]));
  const centres = hubs().flatMap((h) => {
    const c = where.get(h.cities[0] ?? '');
    return c ? [{ lat: c.lat, lon: c.lon, label: hubTitle(h.label) }] : [];
  });
  return constellation(points, { width, height, pad: 48, trim: 0.005, bin: 0.3, minRadius: 3, maxRadius: 34, fit: true }, centres);
}
