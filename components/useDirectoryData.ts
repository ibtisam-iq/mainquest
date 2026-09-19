'use client';

import { useEffect, useState } from 'react';
import type { CoreRecord, ExtraRecord } from '../lib/payload.ts';
import type { Facets } from './types.ts';

interface DirectoryData {
  core: CoreRecord[] | null;
  facets: Facets | null;
  extra: Record<string, ExtraRecord> | null;
  error: string | null;
}

// The core file and facets load first so the list appears; the extra file follows in the background.
export function useDirectoryData(): DirectoryData {
  const [state, setState] = useState<DirectoryData>({ core: null, facets: null, extra: null, error: null });
  useEffect(() => {
    let cancelled = false;
    const get = async <T,>(path: string): Promise<T> => {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`${path} returned ${res.status}`);
      return res.json() as Promise<T>;
    };
    Promise.all([get<CoreRecord[]>('/data/core.json'), get<Facets>('/data/facets.json')])
      .then(([core, facets]) => {
        if (cancelled) return;
        setState((s) => ({ ...s, core, facets }));
        return get<Record<string, ExtraRecord>>('/data/extra.json').then((extra) => {
          if (!cancelled) setState((s) => ({ ...s, extra }));
        });
      })
      .catch((err: Error) => {
        if (!cancelled) setState((s) => ({ ...s, error: err.message }));
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
