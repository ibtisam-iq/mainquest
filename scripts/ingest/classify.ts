// Ports of the upstream pipeline's own classifiers. The rules are deliberately not improved: the
// cross-check proves these reproduce the upstream city hubs, the local and foreign split, and the
// multi-city list exactly, and any change to the logic would break that proof. The hubs themselves
// (their ids, labels and words) live in rules/hubs.json, so a new hub is a data change.
// Inputs are raw source values, before any normalisation.

import { readFileSync } from 'node:fs';

export type HubId = string;

export interface HubRule {
  id: HubId;
  label: string;
  place: string;
  cities: string[];
  words: string[];
  conditional?: { word: string; unless: string[] }[];
}

interface HubRules {
  hubs: HubRule[];
  rest: { id: HubId; label: string; place: string };
}

const RULES: HubRules = JSON.parse(readFileSync(new URL('./rules/hubs.json', import.meta.url), 'utf8'));

// Every hub in display order, the rest hub last.
export const HUBS: readonly (Omit<HubRule, 'words' | 'conditional'>)[] = [
  ...RULES.hubs.map(({ id, label, place, cities }) => ({ id, label, place, cities })),
  { ...RULES.rest, cities: [] },
];
export const REST_HUB: HubId = RULES.rest.id;

export function determineHubs(operatingLocation: string, officeAddress: string, headquarters: string): Set<HubId> {
  const text = `${operatingLocation.toLowerCase()} ${officeAddress.toLowerCase()} ${headquarters.toLowerCase()}`;
  const hubs = new Set<HubId>();
  for (const hub of RULES.hubs) {
    const named = hub.words.some((w) => text.includes(w));
    const conditional = (hub.conditional ?? []).some((c) => text.includes(c.word) && !c.unless.some((u) => text.includes(u)));
    if (named || conditional) hubs.add(hub.id);
  }
  if (hubs.size === 0) hubs.add(RULES.rest.id);
  return hubs;
}

// The hub a city belongs to, for the report.
export function hubOfCity(city: string): HubId {
  return RULES.hubs.find((h) => h.cities.includes(city))?.id ?? RULES.rest.id;
}

const PAKISTANI_HQ_TERMS = ['lahore', 'rawalpindi', 'islamabad', 'karachi', 'faisalabad', 'peshawar', 'multan', 'sialkot', 'gujranwala', 'pakistan'];

export function hqRelation(headquarters: string): 'local' | 'foreign' {
  const hq = headquarters.trim().toLowerCase();
  return PAKISTANI_HQ_TERMS.some((term) => hq.includes(term)) ? 'local' : 'foreign';
}

export function isMultiCity(operatingLocation: string, hubs: ReadonlySet<HubId>): boolean {
  if (hubs.size >= 2) return true;
  if (!operatingLocation.includes(';')) return false;
  return operatingLocation.split(';').filter((part) => part.trim()).length >= 2;
}
