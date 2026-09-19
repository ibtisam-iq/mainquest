'use client';

import { useEffect, useRef, useState } from 'react';
import type { CoreRecord, ExtraRecord } from '../lib/payload.ts';
import type { Lookups, SearchHit } from './types.ts';

function hostOf(url: string | null): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function docsFor(core: CoreRecord[], lookups: Lookups, extra: Record<string, ExtraRecord> | null) {
  return core.map((r) => {
    const places = new Set<string>();
    for (const o of r.offices) {
      places.add(lookups.city.get(o.city)?.label ?? o.city);
      if (o.area) places.add(lookups.area.get(o.area)?.label ?? '');
    }
    const x = extra?.[r.handle];
    return {
      id: r.handle,
      name: r.name,
      industry: lookups.industry.get(r.industry) ?? r.industry,
      tags: r.tags.map((t) => lookups.tag.get(t) ?? t).join(', '),
      place: [...places].join(', '),
      website: hostOf(r.website),
      specialties: x?.specialties ?? '',
      address: (x?.addresses ?? []).filter(Boolean).join(' | '),
    };
  });
}

export interface SearchState {
  hits: Map<string, SearchHit> | null;
  stage: 'none' | 'core' | 'full';
}

// Runs MiniSearch in a web worker. The index is built from the core file first and rebuilt
// with specialties and addresses once the extra file arrives; the current query is re-run each time.
export function useSearch(core: CoreRecord[] | null, lookups: Lookups | null, extra: Record<string, ExtraRecord> | null, text: string): SearchState {
  const worker = useRef<Worker | null>(null);
  const latest = useRef(0);
  const [stage, setStage] = useState<SearchState['stage']>('none');
  const [hits, setHits] = useState<Map<string, SearchHit> | null>(null);

  useEffect(() => {
    const w = new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    w.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.type === 'ready') setStage(msg.stage);
      if (msg.type === 'results' && msg.id === latest.current) {
        setHits(new Map(msg.hits.map((h: { handle: string; score: number; fields: string[] }) => [h.handle, { score: h.score, fields: h.fields }])));
      }
    };
    return () => w.terminate();
  }, []);

  useEffect(() => {
    if (!core || !lookups || !worker.current) return;
    worker.current.postMessage({ type: 'index', docs: docsFor(core, lookups, extra), stage: extra ? 'full' : 'core' });
  }, [core, lookups, extra]);

  useEffect(() => {
    if (!text.trim()) {
      latest.current++;
      setHits(null);
      return;
    }
    if (stage === 'none' || !worker.current) return;
    const id = ++latest.current;
    worker.current.postMessage({ type: 'search', id, q: text });
  }, [text, stage]);

  return { hits: text.trim() ? hits : null, stage };
}
