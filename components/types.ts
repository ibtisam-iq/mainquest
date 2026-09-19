import type { Facet, HubFacet, OriginFacets } from '../lib/types.ts';

// Country names said with "the": "the United States", "the Netherlands".
const WITH_THE = /^(united |netherlands$|philippines$|czech republic$|bahamas$|maldives$|gambia$|dominican republic$|central african republic$)/i;

// Fills "{country}" in an origin phrase; with no known country, "in {country}" reads "abroad".
export function originText(template: string, country: string | null): string {
  if (!country) return template.replaceAll(' in {country}', ' abroad').replaceAll('{country}', 'abroad');
  return template.replaceAll('{country}', WITH_THE.test(country) ? `the ${country}` : country);
}

export interface AreaFacet extends Facet { city: string; lat: number; lon: number }
export interface CityFacet extends Facet { lat: number; lon: number }

export interface Facets {
  hubs: HubFacet[];
  industries: Facet[];
  tags: Facet[];
  areas: AreaFacet[];
  cities: CityFacet[];
  countries: Facet[];
  origins: OriginFacets;
  tagAliases: Record<string, string>;
}

export interface Lookups {
  industry: Map<string, string>;
  tag: Map<string, string>;
  area: Map<string, AreaFacet>;
  city: Map<string, CityFacet>;
  country: Map<string, string>;
  hub: Map<string, string>;
  hubCities: Map<string, string[]>;
  origins: OriginFacets;
  tagAliases: Record<string, string>;
}

export function buildLookups(f: Facets): Lookups {
  return {
    industry: new Map(f.industries.map((x) => [x.id, x.label])),
    tag: new Map(f.tags.map((x) => [x.id, x.label])),
    area: new Map(f.areas.map((x) => [x.id, x])),
    city: new Map(f.cities.map((x) => [x.id, x])),
    country: new Map(f.countries.map((x) => [x.id, x.label])),
    hub: new Map(f.hubs.map((x) => [x.id, x.label])),
    hubCities: new Map(f.hubs.map((x) => [x.id, x.cities ?? []])),
    origins: f.origins,
    tagAliases: f.tagAliases ?? {},
  };
}

export interface SearchHit {
  score: number;
  fields: string[];
}
