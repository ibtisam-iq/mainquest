// A company's monogram tile: up to two letters from its name, in one of a fixed set of tones chosen by
// its handle, so a company always gets the same tile. Nothing is stored; it is worked out on render.

// Words that say what kind of company it is rather than which one.
const FILLER = new Set(['the', 'pvt', 'ltd', 'limited', 'private', 'inc', 'llc', 'llp', 'co', 'corp', 'of', 'and', 'smc', 'plc', 'gmbh']);

export const AVATAR_TONES = 8;

export function monogram(name: string): string {
  const words = name
    .normalize('NFKC')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[\s\-_/(),&+|:]+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);
  const kept = words.filter((w) => !FILLER.has(w.toLowerCase()));
  const use = kept.length ? kept : words;
  if (use.length === 0) return '#';
  if (use.length > 1) return (first(use[0]) + first(use[1])).toUpperCase();
  // One word written in two parts, such as "VentureDive", gives both capitals.
  const humps = use[0].match(/\p{Lu}(?=\p{Ll})/gu);
  if (humps && humps.length > 1 && /\p{Ll}/u.test(use[0])) return humps.slice(0, 2).join('');
  return first(use[0]).toUpperCase();
}

function first(word: string): string {
  return [...word][0] ?? '';
}

// FNV-1a over the handle: stable across builds and browsers.
export function avatarTone(handle: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < handle.length; i++) {
    h ^= handle.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % AVATAR_TONES;
}
