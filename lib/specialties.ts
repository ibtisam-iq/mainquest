// How a company's specialties text becomes a list, tags and row chips. Shared by the ingest and the
// browser, so the chips a row shows always agree with the tags the ingest counted.
import { clean, slugify } from './text.ts';

// Chips on a company row. Shared specialties (tags) come first, since they double as filters, then the
// company's other specialties in its own order, until the row is full.
export const CHIPS_PER_ROW = 5;

const NOISE = new Set(['etc', 'more', 'others', 'other', 'and-more', 'many-more', 'much-more', 'and-many-more', 'services', 'solutions']);

export function splitSpecialties(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;|•·]+/)
    .map((s) => clean(s).replace(/^(and|&)\s+/i, '').replace(/[.\s]+$/, ''))
    .filter((s) => s.length >= 2 && s.length <= 60);
}

// The tag a specialty label counts under, or null for filler such as "etc".
export function tagIdFor(label: string, aliases: Record<string, string>): string | null {
  const slug = slugify(label);
  if (!slug || NOISE.has(slug)) return null;
  return aliases[slug] ?? slug;
}

// The distinct specialties a company lists, in its own order and wording, without filler.
export function listSpecialties(raw: string | null): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const label of splitSpecialties(raw)) {
    const slug = slugify(label);
    if (!slug || NOISE.has(slug) || seen.has(slug)) continue;
    seen.add(slug);
    out.push(label);
  }
  return out;
}

// The specialties that fill a row after its tag chips: those not already shown as a tag, in the
// company's own order, as many as the row has room for.
export function otherChips(tags: readonly string[], specialties: string | null, aliases: Record<string, string>): string[] {
  const room = Math.max(0, CHIPS_PER_ROW - tags.length);
  if (room === 0) return [];
  return listSpecialties(specialties).filter((label) => !tags.includes(tagIdFor(label, aliases) ?? '')).slice(0, room);
}
