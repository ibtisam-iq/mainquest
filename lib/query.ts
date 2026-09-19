// Filter state, its URL form, and the pure functions that apply it. Shared by the browse view
// and the landing pages, and free of React so it can be tested on its own.

import type { CoreRecord } from './payload.ts';
import { ORIGINS, type Origin } from './types.ts';
import { haversineKm } from './geo.ts';

export type SortKey = 'followers' | 'relevance' | 'distance' | 'name' | 'newest' | 'oldest';
export type TagMatch = 'any' | 'all';

// A range of a number: from `min` up to but not including `max`. The "none" range holds companies
// without the number. Ranges are listed in the order the filter shows them.
export interface Bucket<Id extends string = string> {
  id: Id;
  label: string;
  min: number;
  max: number;
}

export const FOUNDED_BUCKETS = [
  { id: '2023-on', label: '2023 or later', min: 2023, max: Infinity },
  { id: '2020-2022', label: '2020 to 2022', min: 2020, max: 2023 },
  { id: '2015-2019', label: '2015 to 2019', min: 2015, max: 2020 },
  { id: '2010-2014', label: '2010 to 2014', min: 2010, max: 2015 },
  { id: '2000-2009', label: '2000 to 2009', min: 2000, max: 2010 },
  { id: 'before-2000', label: 'Before 2000', min: -Infinity, max: 2000 },
  { id: 'unknown', label: 'Year not listed', min: NaN, max: NaN },
] as const satisfies readonly Bucket[];
export type FoundedBucket = (typeof FOUNDED_BUCKETS)[number]['id'];

// Backward-compatibility mapping for legacy coarse founding year buckets.
const OLD_FOUNDED: Record<string, FoundedBucket[]> = {
  '2020-on': ['2023-on', '2020-2022'],
  '2010-2019': ['2015-2019', '2010-2014'],
  'before-2010': ['2000-2009', 'before-2000'],
};

// Follower count buckets scaled by order of magnitude.
export const FOLLOWER_BUCKETS = [
  { id: 'under-100', label: 'Under 100', min: 0, max: 100 },
  { id: '100-1k', label: '100 to 1K', min: 100, max: 1_000 },
  { id: '1k-10k', label: '1K to 10K', min: 1_000, max: 10_000 },
  { id: '10k-100k', label: '10K to 100K', min: 10_000, max: 100_000 },
  { id: '100k-on', label: '100K or more', min: 100_000, max: Infinity },
  { id: 'none', label: 'Not listed', min: NaN, max: NaN },
] as const satisfies readonly Bucket[];
export type FollowerBucket = (typeof FOLLOWER_BUCKETS)[number]['id'];

// Associated member buckets mapped to standard enterprise headcount tiers.
export const MEMBER_BUCKETS = [
  { id: '1-10', label: '1 to 10', min: 1, max: 11 },
  { id: '11-50', label: '11 to 50', min: 11, max: 51 },
  { id: '51-200', label: '51 to 200', min: 51, max: 201 },
  { id: '201-1000', label: '201 to 1,000', min: 201, max: 1_001 },
  { id: '1001-on', label: 'More than 1,000', min: 1_001, max: Infinity },
  { id: 'none', label: 'Not recorded yet', min: NaN, max: NaN },
] as const satisfies readonly Bucket[];
export type MemberBucket = (typeof MEMBER_BUCKETS)[number]['id'];

// Maps a numeric value to its corresponding bucket ID.
export function bucketOf<Id extends string>(value: number | null, buckets: readonly Bucket<Id>[]): Id {
  const empty = buckets.find((b) => Number.isNaN(b.min))!;
  if (value === null) return empty.id;
  return (buckets.find((b) => value >= b.min && value < b.max) ?? empty).id;
}

export const RADII_KM = [2, 5, 10, 25, 50] as const;
export const DEFAULT_RADIUS_KM = 10;

export const PAGE_SIZES = [10, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 10;

export interface Near {
  lat: number;
  lon: number;
  label: string;
  // Coordinate origin: 'here' for user geolocation, or area/city ID from facet catalogs.
  ref: string;
}

export interface Query {
  q: string;
  hubs: string[];
  // Specific city filter passed via city landing pages.
  inCities: string[];
  areas: string[];
  industries: string[];
  tags: string[];
  // Specialty tag matching strategy: 'any' (disjunction) or 'all' (conjunction).
  tagMatch: TagMatch;
  // Headquarters operational origin.
  origins: Origin[];
  countries: string[];
  multi: boolean;
  web: boolean;
  founded: FoundedBucket[];
  followers: FollowerBucket[];
  members: MemberBucket[];
  // Restrict to offices verified at street or area precision.
  placed: boolean;
  near: Near | null;
  radius: number;
  sort: SortKey | null;
  view: 'list' | 'map';
  page: number;
  per: PageSize;
}

export const EMPTY_QUERY: Query = {
  q: '', hubs: [], inCities: [], areas: [], industries: [], tags: [], tagMatch: 'any', origins: [], countries: [],
  multi: false, web: false, founded: [], followers: [], members: [], placed: false, near: null, radius: DEFAULT_RADIUS_KM, sort: null, view: 'list',
  page: 1, per: DEFAULT_PAGE_SIZE,
};

export type FacetKey = 'hubs' | 'areas' | 'industries' | 'tags' | 'origins' | 'countries' | 'multi' | 'web' | 'founded' | 'followers' | 'members' | 'placed';

export interface PointLookup {
  (ref: string): { lat: number; lon: number; label: string } | null;
}

// ---------- URL form ----------

const list = (v: string | null) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);
const ids = <Id extends string>(v: string | null, buckets: readonly Bucket<Id>[]): Id[] => list(v).filter((x): x is Id => buckets.some((b) => b.id === x));

export function parseQuery(params: URLSearchParams, lookup: PointLookup): Query {
  const radius = Number(params.get('r'));
  let near: Near | null = null;
  const nearParam = params.get('near');
  if (nearParam) {
    const coords = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(nearParam);
    if (coords) near = { lat: Number(coords[1]), lon: Number(coords[2]), label: 'Selected point', ref: 'here' };
    else {
      const p = lookup(nearParam);
      if (p) near = { ...p, ref: nearParam };
    }
  }
  const sort = params.get('sort') as SortKey | null;
  // Legacy URL parameter compatibility for headquarters origin.
  const oldHq = params.get('hq');
  const origins = list(params.get('origin')).filter((o): o is Origin => (ORIGINS as readonly string[]).includes(o));
  const page = Number(params.get('page'));
  const per = Number(params.get('per'));
  return {
    q: params.get('q') ?? '',
    hubs: list(params.get('city')),
    inCities: list(params.get('in')),
    areas: list(params.get('area')),
    industries: list(params.get('industry')),
    tags: list(params.get('specialty')),
    tagMatch: params.get('specialty-match') === 'all' ? 'all' : 'any',
    origins: origins.length ? origins : oldHq === 'local' ? ['local'] : oldHq === 'foreign' ? ORIGINS.filter((o) => o !== 'local') : [],
    countries: list(params.get('country')),
    multi: params.get('multi') === '1',
    web: params.get('website') === '1',
    founded: [...new Set(list(params.get('founded')).flatMap((f) => OLD_FOUNDED[f] ?? (FOUNDED_BUCKETS.some((b) => b.id === f) ? [f as FoundedBucket] : [])))],
    followers: ids(params.get('followers'), FOLLOWER_BUCKETS),
    members: ids(params.get('members'), MEMBER_BUCKETS),
    placed: params.get('placed') === '1',
    near,
    radius: (RADII_KM as readonly number[]).includes(radius) ? radius : DEFAULT_RADIUS_KM,
    sort: sort && ['followers', 'relevance', 'distance', 'name', 'newest', 'oldest'].includes(sort) ? sort : null,
    view: params.get('view') === 'map' ? 'map' : 'list',
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    per: (PAGE_SIZES as readonly number[]).includes(per) ? (per as PageSize) : DEFAULT_PAGE_SIZE,
  };
}

export function serializeQuery(q: Query): string {
  const p = new URLSearchParams();
  if (q.q.trim()) p.set('q', q.q.trim());
  if (q.hubs.length) p.set('city', q.hubs.join(','));
  if (q.inCities.length) p.set('in', q.inCities.join(','));
  if (q.areas.length) p.set('area', q.areas.join(','));
  if (q.industries.length) p.set('industry', q.industries.join(','));
  if (q.tags.length) p.set('specialty', q.tags.join(','));
  if (q.tags.length > 1 && q.tagMatch === 'all') p.set('specialty-match', 'all');
  if (q.origins.length) p.set('origin', q.origins.join(','));
  if (q.countries.length) p.set('country', q.countries.join(','));
  if (q.multi) p.set('multi', '1');
  if (q.web) p.set('website', '1');
  if (q.founded.length) p.set('founded', q.founded.join(','));
  if (q.followers.length) p.set('followers', q.followers.join(','));
  if (q.members.length) p.set('members', q.members.join(','));
  if (q.placed) p.set('placed', '1');
  if (q.near) p.set('near', q.near.ref === 'here' ? `${q.near.lat.toFixed(4)},${q.near.lon.toFixed(4)}` : q.near.ref);
  if (q.near && q.radius !== DEFAULT_RADIUS_KM) p.set('r', String(q.radius));
  if (q.sort) p.set('sort', q.sort);
  if (q.view === 'map') p.set('view', 'map');
  if (q.per !== DEFAULT_PAGE_SIZE) p.set('per', String(q.per));
  if (q.page > 1) p.set('page', String(q.page));
  return p.toString();
}

// ---------- pages ----------

export function pageCount(total: number, per: number): number {
  return Math.max(1, Math.ceil(total / per));
}

// Computes visible pagination window around current page with edge clamping.
export function pageWindow(current: number, count: number, span = 2): (number | 'gap')[] {
  const start = Math.max(1, Math.min(current - span, count - 2 * span));
  const end = Math.min(count, Math.max(current + span, 1 + 2 * span));
  const out: (number | 'gap')[] = [];
  if (start > 1) {
    out.push(1);
    if (start > 3) out.push('gap');
    else if (start === 3) out.push(2);
  }
  for (let i = start; i <= end; i++) out.push(i);
  if (end < count) {
    if (end < count - 2) out.push('gap');
    else if (end === count - 2) out.push(count - 1);
    out.push(count);
  }
  return out;
}

// Groups contiguous chosen buckets for consolidated filter chip labels.
export function rangeRuns<Id extends string>(selected: readonly Id[], buckets: readonly Bucket<Id>[]): Bucket<Id>[][] {
  const runs: Bucket<Id>[][] = [];
  let run: Bucket<Id>[] = [];
  for (const b of buckets) {
    if (selected.includes(b.id) && !Number.isNaN(b.min)) run.push(b);
    else if (run.length) { runs.push(run); run = []; }
  }
  if (run.length) runs.push(run);
  const none = buckets.find((b) => Number.isNaN(b.min) && selected.includes(b.id));
  return none ? [...runs, [none]] : runs;
}

export function activeFilterCount(q: Query): number {
  return (
    q.hubs.length +
    q.inCities.length +
    q.areas.length +
    q.industries.length +
    q.tags.length +
    (q.tags.length > 1 && q.tagMatch === 'all' ? 1 : 0) +
    q.origins.length +
    q.countries.length +
    rangeRuns(q.followers, FOLLOWER_BUCKETS).length +
    rangeRuns(q.members, MEMBER_BUCKETS).length +
    rangeRuns(q.founded, FOUNDED_BUCKETS).length +
    (q.multi ? 1 : 0) +
    (q.web ? 1 : 0) +
    (q.placed ? 1 : 0) +
    (q.near ? 1 : 0)
  );
}

// ---------- matching ----------

export const foundedBucket = (year: number | null): FoundedBucket => bucketOf(year, FOUNDED_BUCKETS);
export const followerBucket = (n: number | null): FollowerBucket => bucketOf(n, FOLLOWER_BUCKETS);
export const memberBucket = (n: number | null): MemberBucket => bucketOf(n, MEMBER_BUCKETS);

// Returns area IDs that remain valid under the current hub filter selection.
export function areasWithin(areas: string[], hubs: string[], hubCities: ReadonlyMap<string, string[]>): string[] {
  if (hubs.length === 0) return areas;
  const named = new Set([...hubCities.values()].flat());
  return areas.filter((a) => {
    const city = a.split(':')[0];
    return hubs.some((h) => {
      const own = hubCities.get(h);
      if (!own) return false;
      return own.length ? own.includes(city) : !named.has(city);
    });
  });
}

// Distance to nearest verified street or area office; city-level centroids are excluded.
export function nearestPlacedKm(r: CoreRecord, near: Near): { km: number; office: number } | null {
  let best: { km: number; office: number } | null = null;
  r.offices.forEach((o, i) => {
    if (o.precision === 'city') return;
    const km = haversineKm(near.lat, near.lon, o.lat, o.lon);
    if (best === null || km < best.km) best = { km, office: i };
  });
  return best;
}

const overlaps = (selected: string[], values: string[]) => selected.length === 0 || values.some((v) => selected.includes(v));

// Multi-facet filter evaluation with optional single-facet exclusion for distribution counting.
export function matches(r: CoreRecord, q: Query, hits: ReadonlySet<string> | null, except: FacetKey | null = null): boolean {
  if (hits && !hits.has(r.handle)) return false;
  if (except !== 'hubs' && !overlaps(q.hubs, r.hubs)) return false;
  if (q.inCities.length && !r.offices.some((o) => q.inCities.includes(o.city))) return false;
  if (except !== 'areas' && q.areas.length && !r.offices.some((o) => o.area !== null && q.areas.includes(o.area))) return false;
  if (except !== 'industries' && !overlaps(q.industries, [r.industry])) return false;
  if (except !== 'tags' && q.tags.length && !(q.tagMatch === 'all' ? q.tags.every((t) => r.tags.includes(t)) : q.tags.some((t) => r.tags.includes(t)))) return false;
  if (except !== 'origins' && !overlaps(q.origins, [r.origin])) return false;
  if (except !== 'countries' && q.countries.length && !(r.hqCountry && q.countries.includes(r.hqCountry))) return false;
  if (except !== 'multi' && q.multi && !r.multiCity) return false;
  if (except !== 'web' && q.web && !r.website) return false;
  if (except !== 'founded' && !overlaps(q.founded, [foundedBucket(r.founded)])) return false;
  if (except !== 'followers' && !overlaps(q.followers, [followerBucket(r.followers)])) return false;
  if (except !== 'members' && !overlaps(q.members, [memberBucket(r.members)])) return false;
  if (except !== 'placed' && q.placed && !r.offices.some((o) => o.precision !== 'city')) return false;
  if (q.near) {
    const d = nearestPlacedKm(r, q.near);
    if (!d || d.km > q.radius) return false;
  }
  return true;
}

// Aggregates facet distribution counts, optionally isolating a target facet for conditional counts.
export function countFacet(records: readonly CoreRecord[], q: Query, hits: ReadonlySet<string> | null, key: FacetKey | null, valuesOf: (r: CoreRecord) => Iterable<string>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of records) {
    if (!matches(r, q, hits, key)) continue;
    for (const v of new Set(valuesOf(r))) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return counts;
}

// Groups companies with city-only precision near target coordinates for supplemental display.
export function cityOnlyNear(records: readonly CoreRecord[], q: Query, hits: ReadonlySet<string> | null, cities: { id: string; lat: number; lon: number }[]): Map<string, CoreRecord[]> {
  const out = new Map<string, CoreRecord[]>();
  if (!q.near) return out;
  const reach = Math.max(q.radius, 15);
  const nearbyCities = new Set(cities.filter((c) => haversineKm(q.near!.lat, q.near!.lon, c.lat, c.lon) <= reach).map((c) => c.id));
  if (nearbyCities.size === 0) return out;
  const noNear = { ...q, near: null };
  for (const r of records) {
    if (nearestPlacedKm(r, q.near) !== null && nearestPlacedKm(r, q.near)!.km <= q.radius) continue;
    if (r.offices.some((o) => o.precision !== 'city' && nearbyCities.has(o.city))) continue;
    if (!matches(r, noNear, hits)) continue;
    const city = r.offices.find((o) => o.precision === 'city' && nearbyCities.has(o.city))?.city;
    if (!city) continue;
    const group = out.get(city) ?? [];
    group.push(r);
    out.set(city, group);
  }
  return out;
}

export function sortRecords(records: CoreRecord[], sort: SortKey, scores: ReadonlyMap<string, number> | null, near: Near | null): CoreRecord[] {
  // Strips leading non-alphanumeric punctuation for consistent alphabetical ordering.
  const key = (r: CoreRecord) => r.name.replace(/^[^\p{L}\p{N}]+/u, '');
  const byName = (a: CoreRecord, b: CoreRecord) => key(a).localeCompare(key(b), 'en', { sensitivity: 'base' });
  const copy = [...records];
  if (sort === 'relevance' && scores) return copy.sort((a, b) => (scores.get(b.handle) ?? 0) - (scores.get(a.handle) ?? 0) || byName(a, b));
  if (sort === 'distance' && near) {
    const d = new Map(copy.map((r) => [r.handle, nearestPlacedKm(r, near)?.km ?? Infinity]));
    return copy.sort((a, b) => d.get(a.handle)! - d.get(b.handle)! || byName(a, b));
  }
  if (sort === 'followers') return copy.sort((a, b) => (b.followers ?? -1) - (a.followers ?? -1) || byName(a, b));
  if (sort === 'newest') return copy.sort((a, b) => (b.founded ?? -1) - (a.founded ?? -1) || byName(a, b));
  if (sort === 'oldest') return copy.sort((a, b) => (a.founded ?? 9999) - (b.founded ?? 9999) || byName(a, b));
  return copy.sort(byName);
}

// Resolves active sort key, falling back to follower rank when contextual sorts (distance/relevance) are invalid.
export function effectiveSort(q: Query, searching: boolean): SortKey {
  if (q.sort === 'relevance') return searching ? 'relevance' : 'followers';
  if (q.sort === 'distance') return q.near ? 'distance' : 'followers';
  return q.sort ?? 'followers';
}
