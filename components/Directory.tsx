'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { EMPTY_QUERY, FOLLOWER_BUCKETS, FOUNDED_BUCKETS, MEMBER_BUCKETS, PAGE_SIZES, areasWithin, rangeRuns, activeFilterCount, cityOnlyNear, effectiveSort, matches, pageCount, parseQuery, serializeQuery, sortRecords, type Bucket, type PageSize, type Query, type SortKey } from '../lib/query.ts';
import { cityCode } from '../lib/city-codes.ts';
import { useDirectoryData } from './useDirectoryData.ts';
import { useSearch } from './useSearch.ts';
import { buildLookups } from './types.ts';
import { Filters } from './Filters.tsx';
import { NearControl } from './NearControl.tsx';
import { CompanyRow } from './CompanyRow.tsx';
import { ExportButton } from './ExportButton.tsx';
import { Pagination } from './Pagination.tsx';
import { CityTiles, type CityTileData } from './CityTiles.tsx';
import { FiltersSkeleton, ListSkeleton, SearchBox } from './DirectoryShell.tsx';
import { Icon } from './Icon.tsx';
import { FloatingBar } from './FloatingBar.tsx';
import { searchTerms } from '../lib/highlight.ts';
import dynamic from 'next/dynamic';

// Client-only dynamic import for MapLibre vector map container.
const ResultsMap = dynamic(() => import('./ResultsMap.tsx'), { ssr: false, loading: () => <div className="results-map results-map--loading">Loading map…</div> });

const SORT_LABELS: Record<SortKey, string> = {
  followers: 'Most followed', relevance: 'Best match', distance: 'Nearest', name: 'Name, A to Z', newest: 'Newest first', oldest: 'Oldest first',
};

function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

// Collapses adjacent discrete buckets into single continuous range filter chips.
const compact = (x: number) => (x >= 1000 ? `${x / 1000}K` : String(x));
function rangeChips<Id extends string>(key: string, selected: Id[], buckets: readonly Bucket<Id>[], name: (run: Bucket<Id>[]) => string, clear: (left: Id[]) => Partial<Query>) {
  return rangeRuns(selected, buckets).map((run) => ({
    key: `${key}-${run[0].id}`,
    label: name(run),
    clear: clear(selected.filter((id) => !run.some((b) => b.id === id))),
  }));
}
const low = (run: Bucket[]) => Math.min(...run.map((b) => b.min));
const high = (run: Bucket[]) => Math.max(...run.map((b) => b.max));
const followersChip = (run: Bucket[]) =>
  Number.isNaN(run[0].min) ? 'Followers not listed'
  : run.length === 1 ? `${run[0].label} followers`
  : low(run) === 0 ? `Under ${compact(high(run))} followers`
  : high(run) === Infinity ? `${compact(low(run))} or more followers`
  : `${compact(low(run))} to ${compact(high(run))} followers`;
const membersChip = (run: Bucket[]) =>
  Number.isNaN(run[0].min) ? 'Associated members not recorded'
  : run.length === 1 ? `${run[0].label} associated members`
  : high(run) === Infinity ? `${low(run).toLocaleString('en')} or more associated members`
  : `${low(run).toLocaleString('en')} to ${(high(run) - 1).toLocaleString('en')} associated members`;
const foundedChip = (run: Bucket[]) =>
  Number.isNaN(run[0].min) ? 'Founding year not listed'
  : run.length === 1 ? `Founded ${run[0].label.replace(/^B/, 'b')}`
  : low(run) === -Infinity ? `Founded ${high(run) - 1} or earlier`
  : high(run) === Infinity ? `Founded ${low(run)} or later`
  : `Founded ${low(run)} to ${high(run) - 1}`;

export default function Directory({ total, tiles }: { total: number; tiles: CityTileData[] }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { core, facets, extra, error } = useDirectoryData();
  const lookups = useMemo(() => (facets ? buildLookups(facets) : null), [facets]);

  const pointLookup = useCallback(
    (ref: string) => {
      if (!lookups) return null;
      if (ref.startsWith('city:')) {
        const c = lookups.city.get(ref.slice(5));
        return c ? { lat: c.lat, lon: c.lon, label: `${c.label} (city centre)` } : null;
      }
      const a = lookups.area.get(ref);
      return a ? { lat: a.lat, lon: a.lon, label: `${a.label}, ${cityCode(a.city)}` } : null;
    },
    [lookups],
  );
  const query = useMemo(() => parseQuery(new URLSearchParams(params.toString()), pointLookup), [params, pointLookup]);

  // State updates reset pagination to page 1.
  const update = useCallback(
    (patch: Partial<Query>) => {
      const next = serializeQuery({ ...query, page: 1, ...patch });
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    },
    [query, router, pathname],
  );
  const pageHref = useCallback((page: number) => {
    const next = serializeQuery({ ...query, page });
    return next ? `${pathname}?${next}` : pathname;
  }, [query, pathname]);
  const resultsTop = useRef<HTMLDivElement | null>(null);
  const toResultsTop = useCallback(() => resultsTop.current?.scrollIntoView({ block: 'start' }), []);

  // Debounced search input synchronization with URL state (300ms).
  const [text, setText] = useState(query.q);
  const lastPushed = useRef(query.q);
  useEffect(() => {
    if (query.q !== lastPushed.current) {
      setText(query.q);
      lastPushed.current = query.q;
    }
  }, [query.q]);
  useEffect(() => {
    if (text === query.q) return;
    const t = setTimeout(() => {
      lastPushed.current = text;
      update({ q: text });
    }, 300);
    return () => clearTimeout(t);
  }, [text, query.q, update]);

  // Global keyboard shortcut ('/') to focus search input.
  const searchInput = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      e.preventDefault();
      searchInput.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const search = useSearch(core, lookups, extra, text);
  const hitSet = useMemo(() => (search.hits ? new Set(search.hits.keys()) : null), [search.hits]);
  const scores = useMemo(() => (search.hits ? new Map([...search.hits].map(([h, v]) => [h, v.score])) : null), [search.hits]);
  const searching = text.trim().length > 0;
  const terms = useMemo(() => searchTerms(text), [text]);
  const preferCities = useMemo(() => [...query.inCities, ...query.hubs.flatMap((h) => lookups?.hubCities.get(h) ?? [])], [query.inCities, query.hubs, lookups]);
  const sort = effectiveSort(query, searching);

  const results = useMemo(() => {
    if (!core) return [];
    return sortRecords(core.filter((r) => matches(r, query, hitSet)), sort, scores, query.near);
  }, [core, query, hitSet, sort, scores]);

  const cityOnly = useMemo(() => (core && facets && query.near ? cityOnlyNear(core, query, hitSet, facets.cities) : new Map()), [core, facets, query, hitSet]);

  // Clamp active page index within available page count.
  const pages = pageCount(results.length, query.per);
  const page = Math.min(query.page, pages);
  const pageRows = useMemo(() => results.slice((page - 1) * query.per, page * query.per), [results, page, query.per]);

  // Mobile modal state: trap scroll and handle Escape key dismissal.
  const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => {
    if (!filtersOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFiltersOpen(false); };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [filtersOpen]);
  const toggleTag = useCallback((id: string) => update({ tags: query.tags.includes(id) ? query.tags.filter((t) => t !== id) : [...query.tags, id] }), [query.tags, update]);
  // Reset all search criteria and facet selections while preserving view and pagination size settings.
  const clearAll = useCallback(() => {
    setText('');
    const next = serializeQuery({ ...EMPTY_QUERY, view: query.view, per: query.per });
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [router, pathname, query.view, query.per]);

  const hero = (
    <div className="hero-tools">
      <div className="container">
        <SearchBox total={total} value={text} onChange={setText} onClear={() => { setText(''); searchInput.current?.focus(); }} inputRef={searchInput} onEscape={() => setText('')} />
        <CityTiles tiles={tiles} />
      </div>
    </div>
  );

  if (error || !core || !facets || !lookups) {
    return (
      <>
        {hero}
        <div className="container">
          <div className="directory">
            <aside className="filters" aria-hidden="true"><div className="filters__body">{!error && <FiltersSkeleton />}</div></aside>
            <section className="results" aria-label="Results" aria-busy={!error}>
              {error ? (
                <p className="status status--error" role="alert">The directory could not load ({error}). Reload the page to try again.</p>
              ) : (
                <>
                  <span className="sk sk-toolbar" />
                  <ListSkeleton />
                  <p className="sr-only" role="status">Loading {total.toLocaleString('en')} companies</p>
                </>
              )}
            </section>
          </div>
        </div>
      </>
    );
  }

  const active = activeFilterCount(query);
  const chips: { key: string; label: string; clear: Partial<Query> }[] = [
    ...query.hubs.map((h) => { const hubs = query.hubs.filter((x) => x !== h); return { key: `hub-${h}`, label: lookups.hub.get(h) ?? h, clear: { hubs, areas: areasWithin(query.areas, hubs, lookups.hubCities) } }; }),
    ...query.inCities.map((c) => ({ key: `in-${c}`, label: `Offices in ${lookups.city.get(c)?.label ?? c}`, clear: { inCities: query.inCities.filter((x) => x !== c) } })),
    ...query.areas.map((a) => ({ key: `area-${a}`, label: lookups.area.get(a)?.label ?? a, clear: { areas: query.areas.filter((x) => x !== a) } })),
    ...query.industries.map((i) => ({ key: `ind-${i}`, label: lookups.industry.get(i) ?? i, clear: { industries: query.industries.filter((x) => x !== i) } })),
    ...query.tags.map((t) => ({ key: `tag-${t}`, label: lookups.tag.get(t) ?? t, clear: { tags: query.tags.filter((x) => x !== t) } })),
    ...(query.tags.length > 1 && query.tagMatch === 'all' ? [{ key: 'tag-all', label: 'All chosen specialties', clear: { tagMatch: 'any' as const } }] : []),
    ...query.origins.map((o) => { const origins = query.origins.filter((x) => x !== o); return { key: `o-${o}`, label: lookups.origins.values.find((v) => v.id === o)?.label ?? o, clear: { origins, countries: origins.some((x) => x !== 'local') ? query.countries : [] } }; }),
    ...query.countries.map((c) => ({ key: `c-${c}`, label: lookups.country.get(c) ?? c, clear: { countries: query.countries.filter((x) => x !== c) } })),
    ...rangeChips('fl', query.followers, FOLLOWER_BUCKETS, followersChip, (followers) => ({ followers })),
    ...rangeChips('m', query.members, MEMBER_BUCKETS, membersChip, (members) => ({ members })),
    ...rangeChips('f', query.founded, FOUNDED_BUCKETS, foundedChip, (founded) => ({ founded })),
    ...(query.multi ? [{ key: 'multi', label: 'Several cities', clear: { multi: false } }] : []),
    ...(query.web ? [{ key: 'web', label: 'Website listed', clear: { web: false } }] : []),
    ...(query.placed ? [{ key: 'placed', label: 'Street or area known', clear: { placed: false } }] : []),
    ...(query.near ? [{ key: 'near', label: `Within ${query.radius} km of ${query.near.label}`, clear: { near: null, sort: null } }] : []),
  ];
  const cityOnlyTotal = [...cityOnly.values()].reduce((n, g) => n + g.length, 0);
  const unmapped = query.view === 'map' ? results.filter((r) => !r.offices.some((o) => o.precision !== 'city')).length : 0;
  const sortOptions: SortKey[] = ['followers', ...(searching ? ['relevance' as const] : []), ...(query.near ? ['distance' as const] : []), 'name', 'newest', 'oldest'];
  const perSelect = (id: string, className: string) => (
    <div className={`select ${className}`}>
      <label className="sr-only" htmlFor={id}>Companies per page</label>
      <select id={id} value={query.per} onChange={(e) => update({ per: Number(e.target.value) as PageSize })}>
        {PAGE_SIZES.map((n) => <option key={n} value={n}>{n} per page</option>)}
      </select>
      <Icon name="chevronDown" size={15} />
    </div>
  );

  return (
    <>
      {hero}
      <div className="container">
        <div className="directory">
          {filtersOpen && <div className="scrim" onClick={() => setFiltersOpen(false)} />}
          <Filters core={core} query={query} hits={hitSet} facets={facets} lookups={lookups} update={update}
            open={filtersOpen} onClose={() => setFiltersOpen(false)} resultCount={results.length} active={active} onClearAll={clearAll}
            near={<NearControl query={query} facets={facets} update={update} />} />

          <section className="results" aria-label="Results">
            <div className="toolbar" ref={resultsTop}>
              <p className="toolbar__count" aria-live="polite">
                <strong>{results.length.toLocaleString('en')}</strong> {results.length === 1 ? 'company' : 'companies'}
                {query.near && <> within {query.radius} km</>}
                {(query.near && cityOnlyTotal > 0) || (searching && search.stage === 'core') ? (
                  <small>
                    {query.near && cityOnlyTotal > 0 && <a href="#city-only">{cityOnlyTotal.toLocaleString('en')} more listed by city only</a>}
                    {searching && search.stage === 'core' && <>Searching names and tags; specialties load next</>}
                  </small>
                ) : null}
              </p>
              <ExportButton records={results} extra={extra} lookups={lookups} near={query.near} />
              <span className="toolbar__break" aria-hidden="true" />
              <button type="button" className="btn filters-toggle" onClick={() => setFiltersOpen(true)} aria-haspopup="dialog">
                <Icon name="sliders" size={16} />Filters{active > 0 && <span className="badge">{active}</span>}
              </button>
              <div className="segmented" role="group" aria-label="View">
                <button type="button" aria-pressed={query.view === 'list'} onClick={() => update({ view: 'list' })} aria-label="List"><Icon name="list" size={16} /><span className="seg-word">List</span></button>
                <button type="button" aria-pressed={query.view === 'map'} onClick={() => update({ view: 'map' })} aria-label="Map"><Icon name="map" size={16} /><span className="seg-word">Map</span></button>
              </div>
              <div className="select select--sort">
                <label className="sr-only" htmlFor="sort">Sort</label>
                <select id="sort" value={sort} onChange={(e) => update({ sort: e.target.value as SortKey })}>
                  {sortOptions.map((s) => <option key={s} value={s}>{SORT_LABELS[s]}</option>)}
                </select>
                <Icon name="chevronDown" size={15} />
              </div>
              {perSelect('per', 'select--per')}
            </div>

            {chips.length > 0 && (
              <div className="chips-active">
                {chips.map((c) => (
                  <button key={c.key} type="button" className="chip-active" onClick={() => update(c.clear)} aria-label={`Remove filter: ${c.label}`}>
                    {c.label} <Icon name="close" size={13} stroke={2.25} />
                  </button>
                ))}
                <button type="button" className="text-button" onClick={clearAll}>Clear all</button>
              </div>
            )}

            {query.view === 'map' && results.length > 0 && (
              <>
                <ResultsMap records={results} lookups={lookups} near={query.near} radiusKm={query.radius} areas={query.areas} hubs={query.hubs} onArea={(id) => update({ areas: [id] })} />
                <p className="map-note">
                  <Icon name="info" size={14} />
                  {unmapped > 0
                    ? `${unmapped.toLocaleString('en')} of these ${results.length.toLocaleString('en')} companies list only a city, so they are in the list below but not on the map.`
                    : 'Every company listed here is on the map.'}
                </p>
              </>
            )}
            {results.length === 0 ? (
              <div className="empty">
                <span className="empty__icon"><Icon name="search" size={22} /></span>
                <h2>No companies match</h2>
                <p>{query.near ? 'Nothing is placed within this distance. A wider radius, or the companies listed below by city, may help.' : 'Removing a filter or shortening the search widens the list.'}</p>
                {(active > 0 || searching) && <button type="button" className="btn" onClick={clearAll}>Clear search and filters</button>}
              </div>
            ) : (
              <>
                <ol className="list" start={(page - 1) * query.per + 1}>
                  {pageRows.map((r) => (
                    <CompanyRow key={r.handle} record={r} extra={extra?.[r.handle]} extraLoaded={extra !== null} lookups={lookups} near={query.near}
                      hit={search.hits?.get(r.handle)} selectedTags={query.tags} onTag={toggleTag} terms={terms} preferCities={preferCities} />
                  ))}
                </ol>
                <Pagination page={page} count={pages} total={results.length} per={query.per} href={pageHref} onNavigate={toResultsTop}>
                  {perSelect('per-bottom', 'select--per-bottom')}
                </Pagination>
              </>
            )}

            {query.near && cityOnlyTotal > 0 && (
              <section className="city-only" id="city-only">
                <h2 className="city-only__title">Also nearby, exact location not listed</h2>
                <p className="city-only__note">These companies list only a city, so they are not ranked by distance.</p>
                {[...cityOnly.entries()].map(([city, group]) => (
                  <details key={city}>
                    <summary>
                      <span>In {lookups.city.get(city)?.label ?? city}: {group.length.toLocaleString('en')} {group.length === 1 ? 'company' : 'companies'}</span>
                      <Icon name="chevronDown" size={16} />
                    </summary>
                    <ol className="list">
                      {sortRecords(group, 'followers', null, null).slice(0, 200).map((r) => (
                        <CompanyRow key={r.handle} record={r} extra={extra?.[r.handle]} extraLoaded={extra !== null} lookups={lookups} near={null}
                          hit={search.hits?.get(r.handle)} selectedTags={query.tags} onTag={toggleTag} terms={terms} preferCities={preferCities} />
                      ))}
                    </ol>
                    {group.length > 200 && <p>Showing the first 200. Choosing that city in the City filter lists all of them.</p>}
                  </details>
                ))}
              </section>
            )}

            <div className="legend" aria-label="Location markers">
              <span className="gridref" data-precision="street"><span className="gridref__dot" />Street</span>
              <span className="gridref" data-precision="area"><span className="gridref__dot" />Area</span>
              <span className="gridref" data-precision="city"><span className="gridref__dot" />City only</span>
              <span className="legend__note">How precisely each office is placed. Only street and area offices are used for distance.</span>
            </div>
          </section>
        </div>
      </div>
      {results.length > 0 && (
        <FloatingBar anchor={resultsTop} active={active} view={query.view} onFilters={() => setFiltersOpen(true)} onView={(view) => update({ view })} />
      )}
    </>
  );
}
