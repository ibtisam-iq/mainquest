import type { CompanyRecord } from '../../lib/types.ts';

export interface IngestReport {
  sourceRows: number;
  published: number;
  dropped: Record<string, number>;
  hubs: Record<string, number>;
  hq: { local: number; foreign: number; hqCountryUnresolved: number; foreignResolvedToPakistan: number };
  // Companies by where they are run from and the evidence for it, as "origin/basis" (decision 27).
  origin: Record<string, number>;
  multiCity: number;
  facets: { industries: number; tags: number; areas: number; cities: number; citiesLearned: number; countries: number };
  coverage: { website: number; founded: number; specialties: number; tags: number; followers: number; members: number; companyId: number };
  companyIds: { fromSource: number; fromKnownList: number; rejected: number; shared: string[] };
  cleaning: { websiteDropped: Record<string, number>; trackingStripped: number; specialtiesWithLinks: number; foundedRejected: number; namesFromHandle: number; industryNotListed: number };
  offices: {
    total: number;
    byPrecision: Record<string, number>;
    companiesWithStreetOrArea: number;
    detailedAddresses: number;
    geocoded: number;
    uncached: number;
    rejectedFar: number;
    cityLevelOnlyResult: number;
    unlocatedCompanies: number;
    officeCityOutsideHubs: number;
    placedByKnownPlace: number;
    streetConfirmedByPlace: number;
    // Offices the source lists among the Pakistani ones that are outside Pakistan, left out.
    abroad: number;
    // Operating-location cities that no address is in, taken as another name for an address's city.
    operatingCityReplaced: number;
    // Offices in a place the operating locations name but no city lookup knows, left without a position.
    unknownPlace: number;
  };
  platformMentions: { handle: number; name: number; specialties: number; address: number; website: number };
  unresolvedHeadquarters: { value: string; count: number }[];
}

export function printSummary(r: IngestReport, writes: Record<string, string>): void {
  const pct = (n: number) => `${((n / r.published) * 100).toFixed(1)}%`;
  console.log(`Source rows ${r.sourceRows}, published ${r.published}, dropped ${JSON.stringify(r.dropped)}`);
  console.log(`Hubs ${JSON.stringify(r.hubs)}, local ${r.hq.local}, foreign ${r.hq.foreign}, multi-city ${r.multiCity}`);
  console.log(`Facets: ${r.facets.industries} industries, ${r.facets.tags} specialty tags, ${r.facets.areas} areas, ${r.facets.cities} cities, ${r.facets.countries} HQ countries`);
  console.log(`Coverage: website ${r.coverage.website} (${pct(r.coverage.website)}), founded ${r.coverage.founded} (${pct(r.coverage.founded)}), specialties ${r.coverage.specialties} (${pct(r.coverage.specialties)}), followers ${r.coverage.followers} (${pct(r.coverage.followers)}), associated members ${r.coverage.members} (${pct(r.coverage.members)}), company ids ${r.coverage.companyId} (${r.companyIds.fromSource} from the source, ${r.companyIds.fromKnownList} from rules/company-ids.json, ${r.companyIds.rejected} rejected, ${r.companyIds.shared.length} set aside as shared${r.companyIds.shared.length ? `: ${r.companyIds.shared.join(', ')}` : ''})`);
  console.log(`Run from: ${Object.entries(r.origin).map(([k, n]) => `${k} ${n}`).join(', ')}`);
  const o = r.offices;
  console.log(`Offices ${o.total} ${JSON.stringify(o.byPrecision)}; companies placeable by distance ${o.companiesWithStreetOrArea} (${pct(o.companiesWithStreetOrArea)})`);
  console.log(`Placement: ${o.placedByKnownPlace} offices placed at a known place (${o.streetConfirmedByPlace} confirmed to street level); geocoder: ${o.detailedAddresses} detailed addresses, ${o.geocoded} placed, ${o.uncached} not yet looked up, ${o.cityLevelOnlyResult} only resolved to a city, ${o.rejectedFar} rejected as too far from their city; ${o.abroad} outside Pakistan left out; ${o.operatingCityReplaced} operating-location cities with no address taken as an address's city; ${o.unknownPlace} in a place no lookup knows`);
  if (o.uncached > 0) console.log(`  Run "npm run geocode" to look up the ${o.uncached} new addresses.`);
  for (const [file, state] of Object.entries(writes)) console.log(`  ${state.padEnd(9)} ${file}`);
}

// Printed only. Never written to a committed file, since it depends on the previous run.
export function printChanges(before: CompanyRecord[] | null, after: CompanyRecord[]): void {
  if (!before) {
    console.log('No previous dataset. Everything is new.');
    return;
  }
  const old = new Map(before.map((r) => [r.handle, r]));
  const now = new Map(after.map((r) => [r.handle, r]));
  const added = after.filter((r) => !old.has(r.handle)).length;
  const removed = before.filter((r) => !now.has(r.handle)).length;
  const gains = { website: 0, founded: 0, specialties: 0, followers: 0, members: 0, companyId: 0, placedOffice: 0 };
  let changed = 0;
  for (const r of after) {
    const p = old.get(r.handle);
    if (!p) continue;
    if (JSON.stringify(p) !== JSON.stringify(r)) changed++;
    if (!p.website && r.website) gains.website++;
    if (!p.founded && r.founded) gains.founded++;
    if (!p.specialties && r.specialties) gains.specialties++;
    if (p.followers == null && r.followers != null) gains.followers++;
    if (p.members == null && r.members != null) gains.members++;
    if (p.companyId == null && r.companyId != null) gains.companyId++;
    const placed = (x: CompanyRecord) => x.offices.some((o) => o.precision !== 'city');
    if (!placed(p) && placed(r)) gains.placedOffice++;
  }
  console.log(`Changes since last run: ${added} added, ${removed} removed, ${changed} changed. Gained: ${JSON.stringify(gains)}`);
}
