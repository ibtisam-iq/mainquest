import { OFFICE_FIELDS, PUBLISHED_FIELDS, type CompanyRecord, type Office } from '../../lib/types.ts';

const DERIVED_HERE = new Set<string>(['updated', 'origin', 'originBasis']);

// Records are assembled only from the published field list, which fixes their shape and key order.
export function buildRecord(values: CompanyRecord): CompanyRecord {
  const out: Record<string, unknown> = {};
  for (const key of PUBLISHED_FIELDS) out[key] = key === 'offices' ? values.offices.map(buildOffice) : values[key];
  return out as unknown as CompanyRecord;
}

function buildOffice(office: Office): Office {
  const out: Record<string, unknown> = {};
  for (const key of OFFICE_FIELDS) out[key] = office[key];
  return out as unknown as Office;
}

// The date a company's published data last changed. An unchanged record keeps the date it already has,
// so a refresh with nothing new rewrites nothing. A record seen for the first time takes the day its
// source row was counted; a record whose content changed takes the day of the run. Records are compared
// field by field over the published list, and a field the previous record lacks counts as empty, so
// adding a new field changes the date only of companies that have a value for it. Where a company is run
// from is worked out here rather than written by the company, so it never moves the date.
export function resolveUpdated(previous: CompanyRecord | undefined, next: Omit<CompanyRecord, 'updated'>, sourceDate: string | null, today: string): string {
  if (previous && previous.updated) return content(previous) === content(next) ? previous.updated : today;
  return sourceDate ?? today;
}

function content(r: Partial<CompanyRecord>): string {
  return JSON.stringify(PUBLISHED_FIELDS.filter((k) => !DERIVED_HERE.has(k)).map((k) => r[k] ?? null));
}

// The date a count with no date of its own in the source was first recorded here. The same count keeps
// its date across refreshes; a new or different count takes the day of the run.
export function resolveRecordedDate(previousCount: number | null | undefined, previousDate: string | null | undefined, count: number | null, today: string): string | null {
  if (count === null) return null;
  return previousCount === count && previousDate ? previousDate : today;
}

