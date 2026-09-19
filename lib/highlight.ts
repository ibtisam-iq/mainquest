// Marks where the typed words appear in a piece of text, the way search matches them: from the start of a
// word, ignoring case. Used to highlight names and specialties in the results.

import { symbolTerm } from './search-text.ts';

export function searchTerms(query: string): string[] {
  const out: string[] = [];
  // A sector typed with a space ("F 7") is one term, like "F-7".
  const joined = query.toLowerCase().replace(/\b([a-i])\s(\d{1,2})\b/g, '$1-$2');
  for (const piece of joined.split(/[\s,;|]+/)) {
    const trimmed = piece.replace(/^[^\p{L}\p{N}.]+|[^\p{L}\p{N}#+]+$/gu, '');
    // Words written with symbols ("C#", ".NET", "F-7") are marked as written, not as their letters.
    out.push(...(symbolTerm(trimmed) ?? trimmed.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2)));
  }
  // Longest first, so "development" wins over "dev" where both start at one spot.
  return [...new Set(out)].sort((a, b) => b.length - a.length);
}

export interface Part {
  text: string;
  match: boolean;
}

export function highlightParts(text: string, terms: readonly string[]): Part[] {
  const lower = text.toLowerCase();
  // Lowercasing a few characters changes their length; then positions would not line up, so no marks.
  if (terms.length === 0 || lower.length !== text.length) return [{ text, match: false }];
  const marks: [number, number][] = [];
  for (let i = 0; i < lower.length; i++) {
    const atWordStart = i === 0 || !/[\p{L}\p{N}]/u.test(lower[i - 1]);
    // A term that begins with a symbol, such as ".net", may start inside a word ("ASP.NET").
    const term = terms.find((t) => (atWordStart || !/^[\p{L}\p{N}]/u.test(t)) && lower.startsWith(t, i));
    if (term) {
      marks.push([i, i + term.length]);
      i += term.length - 1;
    }
  }
  if (marks.length === 0) return [{ text, match: false }];
  const parts: Part[] = [];
  let at = 0;
  for (const [from, to] of marks) {
    if (from > at) parts.push({ text: text.slice(at, from), match: false });
    parts.push({ text: text.slice(from, to), match: true });
    at = to;
  }
  if (at < text.length) parts.push({ text: text.slice(at), match: false });
  return parts;
}

export function hasMatch(text: string, terms: readonly string[]): boolean {
  return highlightParts(text, terms).some((p) => p.match);
}
