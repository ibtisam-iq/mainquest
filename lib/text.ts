// Text helpers. Comparison never uses localeCompare, whose result depends on the ICU build.

export function compareAscii(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// Collapse whitespace and apply NFC. For text that is stored and shown. Typographic dashes become
// plain hyphens (RULES.md forbids U+2013 and U+2014 anywhere in the repository), and the Unicode
// replacement character and zero-width characters, left behind by broken encodings upstream, are removed.
export function clean(value: string): string {
  return value
    .normalize('NFC')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\uFFFD\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Compatibility form, accents removed, lowercase. For matching only, never stored.
export function fold(value: string): string {
  return value.normalize('NFKC').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function slugify(value: string): string {
  return fold(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Stable lookup key for the geocoding cache.
export function lookupKey(value: string): string {
  return fold(value).replace(/[^a-z0-9]+/g, ' ').trim();
}

// Token-bounded containment on folded text, so a short keyword never matches inside a longer word.
export function tokenText(value: string): string {
  return ` ${lookupKey(value)} `;
}
