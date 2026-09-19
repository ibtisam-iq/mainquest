'use client';

import { useMemo, type ReactNode } from 'react';
import type { CoreRecord } from '../lib/payload.ts';
import {
  FOLLOWER_BUCKETS, FOUNDED_BUCKETS, MEMBER_BUCKETS, areasWithin, countFacet, followerBucket, foundedBucket, memberBucket,
  type Bucket, type FacetKey, type Query,
} from '../lib/query.ts';
import { cityCode } from '../lib/city-codes.ts';
import { FacetGroup, type FacetOption } from './FacetGroup.tsx';
import { Icon } from './Icon.tsx';
import type { Facets, Lookups } from './types.ts';
import type { Origin } from '../lib/types.ts';

interface Props {
  core: CoreRecord[];
  query: Query;
  hits: ReadonlySet<string> | null;
  facets: Facets;
  lookups: Lookups;
  update: (patch: Partial<Query>) => void;
  open: boolean;
  onClose: () => void;
  near: ReactNode;
  resultCount: number;
  active: number;
  onClearAll: () => void;
}

const toggle = <T extends string>(list: T[], id: T) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
const n = (count: number | undefined) => (count ?? 0).toLocaleString('en');

export function Filters({ core, query, hits, facets, lookups, update, open, onClose, near, resultCount, active, onClearAll }: Props) {
  // With "all of these", specialty counts keep the chosen specialties, so each count is what adding it would leave.
  const allTags = query.tagMatch === 'all' && query.tags.length > 0;
  const counts = useMemo(() => {
    const c = (key: FacetKey | null, values: (r: CoreRecord) => Iterable<string>) => countFacet(core, query, hits, key, values);
    return {
      hubs: c('hubs', (r) => r.hubs),
      areas: c('areas', (r) => r.offices.flatMap((o) => (o.area ? [o.area] : []))),
      industries: c('industries', (r) => [r.industry]),
      tags: c(allTags ? null : 'tags', (r) => r.tags),
      origins: c('origins', (r) => [r.origin]),
      countries: c('countries', (r) => (r.hqCountry ? [r.hqCountry] : [])),
      founded: c('founded', (r) => [foundedBucket(r.founded)]),
      followers: c('followers', (r) => [followerBucket(r.followers)]),
      members: c('members', (r) => [memberBucket(r.members)]),
      multi: c('multi', (r) => (r.multiCity ? ['yes'] : [])),
      web: c('web', (r) => (r.website ? ['yes'] : [])),
      placed: c('placed', (r) => (r.offices.some((o) => o.precision !== 'city') ? ['yes'] : [])),
    };
  }, [core, query, hits, allTags]);
  const membersRecorded = useMemo(() => core.filter((r) => r.members !== null).length, [core]);

  const opts = (list: { id: string; label: string }[], m: Map<string, number>): FacetOption[] =>
    list.map((f) => ({ id: f.id, label: f.label, count: m.get(f.id) ?? 0 })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  // Ranges keep their own order: smallest first for sizes, newest first for founding years.
  const ranges = (list: readonly Bucket[], m: Map<string, number>): FacetOption[] => list.map((b) => ({ id: b.id, label: b.label, count: m.get(b.id) ?? 0 }));

  // Areas follow the chosen city hubs; with no hub chosen, every area is listed with its city code.
  const namedHubCities = new Set([...lookups.hubCities.values()].flat());
  const areaOptions = facets.areas
    .filter((a) => {
      if (query.hubs.length === 0) return true;
      return query.hubs.some((h) => {
        const own = lookups.hubCities.get(h);
        if (!own) return false;
        return own.length ? own.includes(a.city) : !namedHubCities.has(a.city);
      });
    })
    .map((a) => ({ id: a.id, label: a.label, hint: cityCode(a.city), count: counts.areas.get(a.id) ?? 0 }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const hubOptions = facets.hubs.map((h) => ({ id: h.id, label: h.label, count: counts.hubs.get(h.id) ?? 0 }));
  // Synchronize area filters when hub selection changes.
  const setHubs = (hubs: string[]) => update({ hubs, areas: areasWithin(query.areas, hubs, lookups.hubCities) });
  // Clear foreign country selection when non-local origin is unselected.
  const setOrigins = (origins: Origin[]) => update({ origins, countries: origins.some((o) => o !== 'local') ? query.countries : [] });

  const tagMatch = query.tags.length > 1 && (
    <div className="segmented segmented--block" role="group" aria-label="Companies with">
      <button type="button" aria-pressed={query.tagMatch === 'any'} onClick={() => update({ tagMatch: 'any' })}>Any of these</button>
      <button type="button" aria-pressed={query.tagMatch === 'all'} onClick={() => update({ tagMatch: 'all' })}>All of these</button>
    </div>
  );

  return (
    <aside className="filters" data-open={open} aria-label="Filters" role={open ? 'dialog' : undefined} aria-modal={open || undefined}>
      {/* Mobile drawer header and dismissal button. */}
      <div className="filters__head">
        <h2 className="filters__title">Filters</h2>
        <button type="button" className="btn btn--ghost" onClick={onClose} aria-label="Close filters"><Icon name="close" size={18} /></button>
      </div>
      <div className="filters__body">
        {near}
        <FacetGroup title="City" keepOrder options={hubOptions} selected={query.hubs} initial={5}
          onToggle={(id) => setHubs(toggle(query.hubs, id))} onClear={() => setHubs([])} />
        <FacetGroup title="Area" options={areaOptions} selected={query.areas} searchable initial={8}
          onToggle={(id) => update({ areas: toggle(query.areas, id) })} onClear={() => update({ areas: [] })} />
        <FacetGroup title="Industry" options={opts(facets.industries, counts.industries)} selected={query.industries} searchable initial={6}
          onToggle={(id) => update({ industries: toggle(query.industries, id) })} onClear={() => update({ industries: [] })} />
        <FacetGroup title="Specialty" options={opts(facets.tags, counts.tags)} selected={query.tags} searchable initial={8} extra={tagMatch}
          onToggle={(id) => update({ tags: toggle(query.tags, id) })} onClear={() => update({ tags: [], tagMatch: 'any' })} />
        <FacetGroup title="Where it is run from" keepOrder options={facets.origins.values.map((v) => ({ id: v.id, label: v.label, count: counts.origins.get(v.id) ?? 0 }))} selected={query.origins} initial={facets.origins.values.length}
          note="Worked out from the listed headquarters and what each company shows about itself; a company's details give the reason."
          onToggle={(id) => setOrigins(toggle(query.origins, id as Origin))} onClear={() => setOrigins([])} />
        {(query.countries.length > 0 || query.origins.some((o) => o !== 'local')) && (
          <FacetGroup title="Headquarters country" options={opts(facets.countries.filter((c) => c.id !== lookups.origins.home), counts.countries)} selected={query.countries} searchable initial={6}
            onToggle={(id) => update({ countries: toggle(query.countries, id) })} onClear={() => update({ countries: [] })} />
        )}
        <FacetGroup title="Followers" keepOrder options={ranges(FOLLOWER_BUCKETS, counts.followers)} selected={query.followers} initial={FOLLOWER_BUCKETS.length}
          onToggle={(id) => update({ followers: toggle(query.followers, id as Query['followers'][number]) })} onClear={() => update({ followers: [] })} />
        <FacetGroup title="Associated members" keepOrder options={ranges(MEMBER_BUCKETS, counts.members)} selected={query.members} initial={MEMBER_BUCKETS.length}
          note={`People whose profile names the company. Recorded for ${n(membersRecorded)} companies so far.`}
          onToggle={(id) => update({ members: toggle(query.members, id as Query['members'][number]) })} onClear={() => update({ members: [] })} />
        <FacetGroup title="Founded" keepOrder options={ranges(FOUNDED_BUCKETS, counts.founded)} selected={query.founded} initial={FOUNDED_BUCKETS.length}
          onToggle={(id) => update({ founded: toggle(query.founded, id as Query['founded'][number]) })} onClear={() => update({ founded: [] })} />

        <section className="facet" aria-label="More">
          <h3 className="facet__title">More</h3>
          <label className="option">
            <input type="checkbox" checked={query.placed} onChange={() => update({ placed: !query.placed })} />
            <span className="option__label">Street or area known</span>
            <span className="option__count">{n(counts.placed.get('yes'))}</span>
          </label>
          <label className="option">
            <input type="checkbox" checked={query.web} onChange={() => update({ web: !query.web })} />
            <span className="option__label">Website listed</span>
            <span className="option__count">{n(counts.web.get('yes'))}</span>
          </label>
          <label className="option">
            <input type="checkbox" checked={query.multi} onChange={() => update({ multi: !query.multi })} />
            <span className="option__label">Offices in more than one city</span>
            <span className="option__count">{n(counts.multi.get('yes'))}</span>
          </label>
        </section>
      </div>
      <div className="filters__foot">
        <button type="button" className="btn btn--lg" onClick={onClearAll} disabled={active === 0}>Clear all</button>
        <button type="button" className="btn btn--lg btn--primary" onClick={onClose}>Show {resultCount.toLocaleString('en')} {resultCount === 1 ? 'company' : 'companies'}</button>
      </div>
    </aside>
  );
}
