'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { Constellation } from '../lib/constellation.ts';
import { areasWithin } from '../lib/query.ts';
import { Icon } from './Icon.tsx';
import { DotMap } from './DotMap.tsx';

export interface CityTileData {
  id: string;
  title: string;
  // Secondary subtext: constituent cities or high-density area.
  note: string;
  count: number;
  // Constituent municipal cities represented by the regional hub.
  cities: string[];
  map: Constellation;
}

// Generates URL search params toggling the hub selection while retaining valid sub-areas.
function toggledHref(search: string, id: string, hubCities: ReadonlyMap<string, string[]>): string {
  const p = new URLSearchParams(search);
  const chosen = (p.get('city') ?? '').split(',').filter(Boolean);
  const next = chosen.includes(id) ? chosen.filter((c) => c !== id) : [...chosen, id];
  if (next.length) p.set('city', next.join(','));
  else p.delete('city');
  const areas = areasWithin((p.get('area') ?? '').split(',').filter(Boolean), next, hubCities);
  if (areas.length) p.set('area', areas.join(','));
  else p.delete('area');
  p.delete('page');
  const qs = p.toString();
  return qs ? `/?${qs}` : '/';
}

// Hub selection cards reflecting active query parameters.
export function CityTilesView({ tiles, search }: { tiles: CityTileData[]; search: string }) {
  const chosen = (new URLSearchParams(search).get('city') ?? '').split(',').filter(Boolean);
  const hubCities = new Map(tiles.map((t) => [t.id, t.cities]));
  return (
    <ul className="city-tiles" aria-label="Cities">
      {tiles.map((t) => {
        const selected = chosen.includes(t.id);
        return (
          <li key={t.id}>
            <Link className="city-tile" data-selected={selected} href={toggledHref(search, t.id, hubCities)} scroll={false} replace
              aria-label={`${t.title}, ${t.count.toLocaleString('en')} companies. ${t.note}.${selected ? ' Selected.' : ''}`}>
              <DotMap map={t.map} className="city-tile__map" />
              <span className="city-tile__text">
                <span className="city-tile__name">{t.title}<span className="city-tile__count">{t.count.toLocaleString('en')}</span></span>
                <span className="city-tile__place">{t.note}</span>
              </span>
              <span className="city-tile__check"><Icon name="check" size={13} stroke={3} /></span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function CityTiles({ tiles }: { tiles: CityTileData[] }) {
  const params = useSearchParams();
  return <CityTilesView tiles={tiles} search={params.toString()} />;
}
