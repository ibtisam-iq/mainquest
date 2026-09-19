// Shapes shared by the data scripts and the site.

export type Precision = 'street' | 'area' | 'city';

// Where a company is run from, and the evidence for it (decision 27, scripts/ingest/origin.ts).
export type Origin = 'local' | 'registered-abroad' | 'international' | 'unclear';
export type OriginBasis = 'headquarters' | 'owner' | 'described-here' | 'described-abroad' | 'registration-address' | 'company-form' | 'website' | 'office-label' | 'none';
export const ORIGINS: readonly Origin[] = ['local', 'registered-abroad', 'international', 'unclear'];
// data/origins.json: each kind with its filter label and the phrase a row shows, the sentence each piece
// of evidence gives, and the notes for companies settled by hand. "{country}" stands for the listed
// headquarters' country.
export interface OriginFacets {
  home: string;
  homeName: string;
  homeAdjective: string;
  values: { id: Origin; label: string; row: string; count: number }[];
  bases: Record<OriginBasis, string>;
  notes: Record<string, string>;
}
export const ORIGIN_BASES: readonly OriginBasis[] = ['headquarters', 'owner', 'described-here', 'described-abroad', 'registration-address', 'company-form', 'website', 'office-label', 'none'];

export interface Office {
  city: string;
  area: string | null;
  lat: number;
  lon: number;
  precision: Precision;
  address: string | null;
}

export interface CompanyRecord {
  handle: string;
  companyId: string | null;
  name: string;
  industry: string;
  hubs: string[];
  hq: 'local' | 'foreign';
  hqCountry: string | null;
  origin: Origin;
  originBasis: OriginBasis;
  multiCity: boolean;
  website: string | null;
  founded: number | null;
  followers: number | null;
  followersAsOf: string | null;
  members: number | null;
  membersAsOf: string | null;
  tags: string[];
  specialties: string | null;
  offices: Office[];
  updated: string;
}

// Key order of every published record. Records are built only from this list.
export const PUBLISHED_FIELDS = [
  'handle',
  'companyId',
  'name',
  'industry',
  'hubs',
  'hq',
  'hqCountry',
  'origin',
  'originBasis',
  'multiCity',
  'website',
  'founded',
  'followers',
  'followersAsOf',
  'members',
  'membersAsOf',
  'tags',
  'specialties',
  'offices',
  'updated',
] as const satisfies readonly (keyof CompanyRecord)[];

export const OFFICE_FIELDS = ['city', 'area', 'lat', 'lon', 'precision', 'address'] as const satisfies readonly (keyof Office)[];

export interface Facet {
  id: string;
  label: string;
  count: number;
}

// A city hub, from scripts/ingest/rules/hubs.json: the cities it stands for, empty for the catch-all hub.
export interface HubFacet extends Facet {
  place: string;
  cities: string[];
}
