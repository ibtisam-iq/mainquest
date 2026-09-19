// The search index: how company text becomes searchable words, and how a typed search becomes a query.
// Run in a web worker by the site (components/search.worker.ts), and directly by the tests.

import MiniSearch, { type Query } from 'minisearch';
import { foldWord, rewriteForSearch, searchWords } from './search-text.ts';

export interface SearchDoc {
  id: string;
  name: string;
  industry: string;
  tags: string;
  place: string;
  website: string;
  specialties: string;
  address: string;
}

// From scripts/ingest/rules/search-synonyms.json.
export interface SearchRules {
  groups: string[][];
  exact: string[];
}

export interface SearchHitData {
  handle: string;
  score: number;
  fields: string[];
}

const fold = foldWord;

const FIELDS = ['name', 'industry', 'tags', 'place', 'website', 'specialties', 'address'] as const;
const BOOST = { name: 5, specialties: 3, tags: 3, industry: 2, place: 1.5, address: 1, website: 1 };
// A word that at least this many companies use is a real word, so it is never read as a typo of another:
// "node" does not find "code", nor "sales" find "tales". A rarer word may be a typo, and one wrong
// letter is forgiven ("kubernets" finds "kubernetes").
const REAL_WORD_COMPANIES = 3;

export interface SearchIndex {
  ms: MiniSearch<SearchDoc>;
  groups: string[][];
}

export function buildIndex(docs: SearchDoc[], rules: SearchRules): SearchIndex {
  // Words that must match as typed: "java" is not the start of "javascript", nor "pos" of "postgresql".
  const exact = new Set(rules.exact.map(fold));
  const companiesUsing = new Map<string, number>();
  for (const d of docs) {
    const words = new Set(FIELDS.flatMap((f) => searchWords(d[f], true).map(fold)));
    for (const w of words) companiesUsing.set(w, (companiesUsing.get(w) ?? 0) + 1);
  }
  const ms = new MiniSearch<SearchDoc>({
    fields: [...FIELDS],
    storeFields: [],
    tokenize: (text) => searchWords(text, true),
    processTerm: (term) => {
      const t = fold(term);
      return t.length > 0 ? t : null;
    },
    searchOptions: {
      boost: BOOST,
      tokenize: (text) => searchWords(text, false),
      // Prefix matching starts at three letters, so a fragment such as "ai" does not match every word it begins.
      prefix: (term) => term.length >= 3 && !exact.has(term),
      fuzzy: (term) => (term.length >= 4 && (companiesUsing.get(term) ?? 0) < REAL_WORD_COMPANIES ? 1 : 0),
      combineWith: 'AND',
    },
  });
  ms.addAll(docs);
  return { ms, groups: rules.groups.map((g) => g.map(fold)) };
}

// A word may be satisfied by any single-word member of its synonym group ("k8s" finds "kubernetes").
// Multi-word members apply only when the whole query is one of them ("dev ops" finds "devops"); split
// into words they would match far too much ("dev" begins "development").
export function expandQuery(q: string, groups: string[][]): Query {
  const whole = fold(rewriteForSearch(q.trim(), false));
  const words = whole.split(/\s+/).filter(Boolean);
  const perWord: Query[] = words.map((w) => {
    const singles = groups.find((g) => g.includes(w))?.filter((m) => !m.includes(' ')) ?? [];
    return singles.length > 1 ? { combineWith: 'OR', queries: singles } : w;
  });
  const base: Query = { combineWith: 'AND', queries: perWord };
  const group = whole.includes(' ') ? groups.find((g) => g.includes(whole)) : undefined;
  const alternatives = group?.filter((m) => m !== whole && !m.includes(' ')) ?? [];
  return alternatives.length ? { combineWith: 'OR', queries: [base, ...alternatives] } : base;
}

export function runSearch(index: SearchIndex, q: string): SearchHitData[] {
  return index.ms.search(expandQuery(q, index.groups)).map((r) => ({
    handle: r.id as string,
    score: r.score,
    fields: [...new Set(Object.values(r.match).flat())],
  }));
}
