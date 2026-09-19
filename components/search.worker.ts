/// <reference lib="webworker" />
// Full-text search, off the main thread so typing never stutters. The index itself is lib/search-index.ts.

import synonyms from '../scripts/ingest/rules/search-synonyms.json';
import { buildIndex, runSearch, type SearchDoc, type SearchIndex } from '../lib/search-index.ts';

type Message =
  | { type: 'index'; docs: SearchDoc[]; stage: 'core' | 'full' }
  | { type: 'search'; id: number; q: string };

let index: SearchIndex | null = null;

self.onmessage = (event: MessageEvent<Message>) => {
  const msg = event.data;
  if (msg.type === 'index') {
    index = buildIndex(msg.docs, synonyms);
    (self as unknown as Worker).postMessage({ type: 'ready', stage: msg.stage });
    return;
  }
  if (msg.type === 'search' && index) {
    (self as unknown as Worker).postMessage({ type: 'results', id: msg.id, q: msg.q, hits: runSearch(index, msg.q) });
  }
};
