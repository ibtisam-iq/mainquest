import type { CompanyRecord, Office } from './types.ts';
import { listSpecialties } from './specialties.ts';

// What the browser downloads first: everything needed to list, filter and locate companies. The
// specialties text waits for the second file, so the first one carries how many there are, which the
// list needs before that file arrives.
export type CoreOffice = Omit<Office, 'address'>;
export type CoreRecord = Omit<CompanyRecord, 'companyId' | 'specialties' | 'offices' | 'followersAsOf' | 'membersAsOf' | 'updated'> & { offices: CoreOffice[]; specialtyCount: number };

// What arrives right after first render, keyed by handle: the longer text used by full search and detail views.
export interface ExtraRecord {
  // Only the associated members link needs it, so it waits for the second file.
  companyId: string | null;
  specialties: string | null;
  addresses: (string | null)[];
  followersAsOf: string | null;
  membersAsOf: string | null;
  updated: string;
}

export function splitPayload(records: readonly CompanyRecord[]): { core: CoreRecord[]; extra: Record<string, ExtraRecord> } {
  const core: CoreRecord[] = [];
  const extra: Record<string, ExtraRecord> = {};
  for (const r of records) {
    const { companyId, specialties, offices, followersAsOf, membersAsOf, updated, ...rest } = r;
    core.push({ ...rest, offices: offices.map(({ address, ...o }) => o), specialtyCount: listSpecialties(specialties).length });
    extra[r.handle] = { companyId, specialties, addresses: offices.map((o) => o.address), followersAsOf, membersAsOf, updated };
  }
  return { core, extra };
}
