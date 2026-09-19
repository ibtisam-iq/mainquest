// The header contract. Every source column is declared here with what happens to it.
// An unknown, renamed or reordered column stops the run, so nothing new is published by accident. A column
// marked optional may be missing from the end of the header, so older copies of the source still load.

export type Disposition = 'publish' | 'derive' | 'exclude';

export type ColumnId =
  | 'name' | 'tagline' | 'website' | 'profileUrl' | 'industry' | 'sizeBand' | 'memberCount'
  | 'founded' | 'entityType' | 'specialties' | 'hq' | 'operatingLocations' | 'officeAddress'
  | 'followerCount' | 'verifiedFlag' | 'jobsUrl' | 'peopleUrl' | 'locationsUrl' | 'longText' | 'trailingDate' | 'companyId';

export interface ColumnSpec {
  readonly index: number;
  readonly id: ColumnId;
  readonly disposition: Disposition;
  readonly match: (header: string) => boolean;
  readonly note: string;
  readonly optional?: boolean;
}

const exact = (expected: string) => (header: string) => header.trim() === expected;

export const SOURCE_COLUMNS: readonly ColumnSpec[] = [
  { index: 0, id: 'name', disposition: 'publish', match: exact('Company Name'), note: 'display name' },
  { index: 1, id: 'tagline', disposition: 'exclude', match: exact('Tagline'), note: 'third-party text, excluded with descriptions' },
  { index: 2, id: 'website', disposition: 'publish', match: exact('Website'), note: 'cleaned company website' },
  { index: 3, id: 'profileUrl', disposition: 'derive', match: (h) => /\bprofile url$/i.test(h.trim()), note: 'source of the handle, never stored' },
  { index: 4, id: 'industry', disposition: 'publish', match: exact('Industry'), note: 'published as a slug' },
  { index: 5, id: 'sizeBand', disposition: 'exclude', match: exact('Company Size'), note: 'volatile, decision 5' },
  { index: 6, id: 'memberCount', disposition: 'publish', match: exact('Associated Members'), note: 'a snapshot dated when first recorded, decision 19' },
  { index: 7, id: 'founded', disposition: 'publish', match: exact('Founded'), note: 'year, validated' },
  { index: 8, id: 'entityType', disposition: 'exclude', match: exact('Company Type'), note: 'empty upstream' },
  { index: 9, id: 'specialties', disposition: 'publish', match: exact('Specialties'), note: 'searchable text and tags' },
  { index: 10, id: 'hq', disposition: 'derive', match: exact('Global Headquarters'), note: 'local or foreign, and a country code' },
  { index: 11, id: 'operatingLocations', disposition: 'derive', match: exact('Operating Location (Pakistan)'), note: 'hubs and offices' },
  { index: 12, id: 'officeAddress', disposition: 'publish', match: exact('Pakistan Office Full Address'), note: 'cleaned office addresses' },
  { index: 13, id: 'followerCount', disposition: 'publish', match: exact('Followers'), note: 'a dated snapshot, decision 18' },
  { index: 14, id: 'verifiedFlag', disposition: 'exclude', match: exact('Verified'), note: 'unreliable' },
  { index: 15, id: 'jobsUrl', disposition: 'exclude', match: exact('Open Jobs URL'), note: 'regenerated from the handle' },
  { index: 16, id: 'peopleUrl', disposition: 'exclude', match: exact('People / HRs URL'), note: 'regenerated from the handle' },
  { index: 17, id: 'locationsUrl', disposition: 'exclude', match: exact('All Office Locations URL'), note: 'regenerated from the handle' },
  { index: 18, id: 'longText', disposition: 'derive', match: exact('Description'), note: 'never published (decision 12); read only for what a company says about where it is based (decision 27)' },
  { index: 19, id: 'trailingDate', disposition: 'derive', match: (h) => /\bdate\b/i.test(h), note: 'the day the row was counted: dates the follower count and seeds the updated date' },
  { index: 20, id: 'companyId', disposition: 'publish', match: exact('Company ID'), optional: true, note: 'the numeric company id, for the associated members search; decision 22' },
];

export class HeaderMismatchError extends Error {}

export function assertHeader(header: readonly string[]): void {
  const required = SOURCE_COLUMNS.filter((c) => !c.optional).length;
  if (header.length < required || header.length > SOURCE_COLUMNS.length) {
    throw new HeaderMismatchError(`Source has ${header.length} columns, the contract declares ${required} to ${SOURCE_COLUMNS.length}. Classify the change in scripts/ingest/columns.ts.`);
  }
  for (const spec of SOURCE_COLUMNS) {
    if (spec.optional && spec.index >= header.length) continue;
    if (!spec.match(header[spec.index] ?? '')) {
      throw new HeaderMismatchError(`Column ${spec.index + 1} does not match the contract for "${spec.id}". Classify the change in scripts/ingest/columns.ts.`);
    }
  }
}

// Only publish and derive columns are ever read out of a row.
export type SourceRow = Record<Extract<ColumnId, 'name' | 'website' | 'profileUrl' | 'industry' | 'founded' | 'specialties' | 'hq' | 'operatingLocations' | 'officeAddress' | 'memberCount' | 'followerCount' | 'trailingDate' | 'companyId' | 'longText'>, string>;

export function toSourceRow(row: readonly string[]): SourceRow {
  const get = (id: ColumnId) => row[SOURCE_COLUMNS.find((c) => c.id === id)!.index] ?? '';
  return {
    name: get('name'),
    website: get('website'),
    profileUrl: get('profileUrl'),
    industry: get('industry'),
    founded: get('founded'),
    specialties: get('specialties'),
    hq: get('hq'),
    operatingLocations: get('operatingLocations'),
    officeAddress: get('officeAddress'),
    memberCount: get('memberCount'),
    followerCount: get('followerCount'),
    trailingDate: get('trailingDate'),
    companyId: get('companyId'),
    longText: get('longText'),
  };
}
