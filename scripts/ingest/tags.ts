import { compareAscii } from '../../lib/text.ts';
import { splitSpecialties, tagIdFor } from '../../lib/specialties.ts';
import type { Facet } from '../../lib/types.ts';

// A specialty only becomes a filter value once this many companies share it.
export const MIN_TAG_COMPANIES = 5;

export class TagBuilder {
  private readonly companies = new Map<string, Set<string>>();
  private readonly labels = new Map<string, Map<string, number>>();
  private readonly aliases: Record<string, string>;

  constructor(aliases: Record<string, string>) {
    this.aliases = aliases;
  }

  add(handle: string, specialties: string | null): string[] {
    const ids = new Set<string>();
    for (const label of splitSpecialties(specialties)) {
      const id = tagIdFor(label, this.aliases);
      if (id === null) continue;
      ids.add(id);
      const byLabel = this.labels.get(id) ?? new Map<string, number>();
      byLabel.set(label, (byLabel.get(label) ?? 0) + 1);
      this.labels.set(id, byLabel);
      const set = this.companies.get(id) ?? new Set<string>();
      set.add(handle);
      this.companies.set(id, set);
    }
    return [...ids];
  }

  facet(): Facet[] {
    return [...this.companies.entries()]
      .filter(([, set]) => set.size >= MIN_TAG_COMPANIES)
      .map(([id, set]) => ({ id, label: mostCommon(this.labels.get(id)!), count: set.size }))
      .sort((a, b) => b.count - a.count || compareAscii(a.id, b.id));
  }
}

export function mostCommon(counts: Map<string, number>): string {
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || compareAscii(a[0], b[0]))[0][0];
}
