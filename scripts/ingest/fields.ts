import { clean } from '../../lib/text.ts';
import { registrableDomain } from './env.ts';

// Literal values the upstream extractor writes when a lookup fails. They are treated as empty.
const ERROR_LITERALS = new Set(['undefined', 'null', 'none', 'nan', '[object object]', 'error', 'timeout']);

export function cleanText(raw: string): string | null {
  const value = clean(raw);
  if (!value) return null;
  if (ERROR_LITERALS.has(value.toLowerCase())) return null;
  return value;
}

// Specialties with any item that is a link taken out: a few companies list their social pages there
// ("https://www.instagram.com/... and https://www.tiktok.com/..."), and only the website field holds links.
const LINK = /https?:\/\/|www\.[a-z0-9-]+\./i;
export function cleanSpecialties(raw: string): { value: string | null; linksDropped: boolean } {
  const value = cleanText(raw);
  if (value === null || !LINK.test(value)) return { value, linksDropped: false };
  const kept = value.split(',').map((s) => s.trim()).filter((s) => s && !LINK.test(s));
  return { value: kept.length ? kept.join(', ') : null, linksDropped: true };
}

// Page interface text that ended up in a name or industry field for a handful of source rows.
const INTERFACE_TEXT = /^(\d+\s+notifications?|skip to (main )?content|skip to search)$/i;

export function isInterfaceText(value: string | null): boolean {
  return value !== null && INTERFACE_TEXT.test(value.trim());
}

const TRACKING_PARAM = /^(utm_[a-z0-9_]+|fbclid|gclid|igshid|mc_cid|mc_eid)$/i;

export type WebsiteOutcome =
  | { value: string; trackingStripped: boolean }
  | { value: null; dropped: 'empty' | 'invalid' | 'scheme' | 'self_link' };

export function cleanWebsite(raw: string, profileDomain: string): WebsiteOutcome {
  let text = clean(raw);
  if (!text || ERROR_LITERALS.has(text.toLowerCase())) return { value: null, dropped: 'empty' };
  if (!/^[a-z][a-z0-9+.-]*:/i.test(text) && /^[\w-]+(\.[\w-]+)+(\/.*)?$/i.test(text)) text = `https://${text}`;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { value: null, dropped: 'invalid' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { value: null, dropped: 'scheme' };
  if (registrableDomain(url.hostname) === profileDomain) return { value: null, dropped: 'self_link' };
  let trackingStripped = false;
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAM.test(key)) {
      url.searchParams.delete(key);
      trackingStripped = true;
    }
  }
  return { value: url.toString(), trackingStripped };
}

export function parseFounded(raw: string, currentYear: number): number | null {
  const text = raw.trim();
  if (!/^\d{4}$/.test(text)) return null;
  const year = Number(text);
  return year >= 1900 && year <= currentYear ? year : null;
}

// Only a count at the end of the cell is read, such as "24K followers" or "1,234 followers". A few cells
// hold a sentence that merely contains the word, and those give no count. Anything before the count
// (some cells carry text specific to one viewer) is ignored.
export function parseFollowers(raw: string): number | null {
  const m = /(?:^|[\s·])(\d[\d,]*(?:\.\d+)?)\s*([KkMm])?\s+followers?\s*$/.exec(raw.trim());
  if (!m) return null;
  const base = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(base)) return null;
  const unit = m[2]?.toLowerCase();
  return Math.round(unit === 'k' ? base * 1_000 : unit === 'm' ? base * 1_000_000 : base);
}

// The numeric company id: digits only, as the source records it. Anything else gives no id.
export function parseCompanyId(raw: string): string | null {
  const text = raw.trim();
  return /^[1-9]\d{0,11}$/.test(text) ? text : null;
}

// The companies whose id another company also has. An id belongs to one company, so a shared one was read
// from another company's page for at least one of them, and nothing says which (decision 22).
export function sharedIdHandles(records: readonly { handle: string; companyId: string | null }[]): Set<string> {
  const owners = new Map<string, string[]>();
  for (const r of records) if (r.companyId) owners.set(r.companyId, [...(owners.get(r.companyId) ?? []), r.handle]);
  return new Set([...owners.values()].filter((handles) => handles.length > 1).flat());
}

// The associated members cell holds a bare whole number ("757" or "1,129"). Anything else gives no count.
export function parseMembers(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d{1,3}(,\d{3})*$|^\d+$/.test(text)) return null;
  return Number(text.replace(/,/g, ''));
}

export function parseIsoDate(raw: string, today: string): string | null {
  const text = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const valid = !Number.isNaN(Date.parse(`${text}T00:00:00Z`)) && new Date(`${text}T00:00:00Z`).toISOString().startsWith(text);
  return valid && text <= today ? text : null;
}

