// Where a company is run from, as opposed to where its headquarters is listed (decision 27). A company
// with offices in the home country is one of four kinds:
//   local              its headquarters is in the home country
//   registered-abroad  its headquarters is listed abroad, and the data shows it is run from the home country
//   international      it is based abroad, by its own account, and has an office in the home country
//   unclear            its headquarters is listed abroad, and nothing in the data says where it is run from
// Each answer carries the evidence it rests on, which the site shows beside it. The first rule that
// applies decides; nothing is guessed. Facts come before claims: a registration address, a company form
// or a head office at home outweighs a description that calls the company "US-based", a phrase many
// companies run from home also use.

import { readFileSync } from 'node:fs';
import { clean, lookupKey } from '../../lib/text.ts';
import type { Origin, OriginBasis } from '../../lib/types.ts';

interface HomeCountry {
  name: string;
  adjective: string;
  places: string[];
  companyForms: string[];
  bodies: string[];
  domains: string[];
}

export interface OriginRules {
  home: string;
  countries: Record<string, HomeCountry>;
  registrationAddresses: { place: string; match: string[] }[];
  abroadNames: Record<string, string[]>;
  companies: Record<string, { origin: Origin; note: string }>;
}

export function loadOriginRules(path: string): OriginRules {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export interface OriginInput {
  handle: string;
  hqText: string;
  hqCountry: string | null;
  // The country's name in English, from the headquarters lookup, when there is one.
  hqCountryName: string | null;
  name: string;
  description: string;
  website: string | null;
  officeAddresses: string[];
}

export interface OriginResult {
  origin: Origin;
  basis: OriginBasis;
}

// Folded words with a space at each end, so a phrase matches only whole words.
const words = (text: string) => ` ${lookupKey(text)} `;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const alternation = (names: readonly string[]) => names.map((n) => escape(lookupKey(n))).filter(Boolean).sort((a, b) => b.length - a.length).join('|');

// Statements of where a company itself is: "based in Lahore", "headquartered in Dubai", "Lahore-based".
// Folded text has no hyphens, so "Lahore-based" reads "lahore based".
const SAYS_BASED = (places: string) => new RegExp(` (?:based in|based out of|headquartered in|headquartered at|hq in|head office (?:is )?in|main office (?:is )?in|founded in|established in|born in|rooted in|operating from|operating out of|operates from|operates out of|located in) (?:the )?(?:heart of |beautiful |city of )?(?:${places}) |(?:^| )(?:${places}) (?:based|headquartered) `);
// "Clients based in the US" and "the majority being UK based" describe the clients, not the company.
// So do "a team based in Lahore" and "UK-based leadership": a part of the company, not the company.
const OTHERS = / (clients|customers|businesses|brands|startups|companies|partners|organi[sz]ations|users|teams?|majority|audience|served|developers|engineers|staff|talent|workforce|office|offices|centre|center|hub)(?: [^ ]+){0,3} $/;
const PART_AFTER = /^ ?(leadership|team|teams|project|projects|partnership|partner|partners|clients|customers|office|offices|staff|developers|engineers|talent|support|delivery)\b/;

function statesBase(text: string, places: string[]): boolean {
  if (places.length === 0) return false;
  const re = SAYS_BASED(alternation(places));
  const hay = words(text);
  let from = 0;
  for (;;) {
    const m = re.exec(hay.slice(from));
    if (!m) return false;
    const at = from + m.index;
    const end = at + m[0].length;
    if (!OTHERS.test(hay.slice(Math.max(0, at - 50), at + 1)) && !PART_AFTER.test(hay.slice(end - 1))) return true;
    from = at + 1;
  }
}

const HEAD_OFFICE_LABEL = /^(head ?quarters?|head ?office|main office|hq|corporate (head ?)?office)$/i;

export function classifyOrigin(input: OriginInput, rules: OriginRules, homeCityNames: readonly string[]): OriginResult {
  const byHand = rules.companies[input.handle];
  if (byHand) return { origin: byHand.origin, basis: 'owner' };

  const home = rules.countries[rules.home];
  const homePlaces = [...home.places, ...homeCityNames];
  // A headquarters in the home country, by its lookup or, when the lookup failed, by a home city it names.
  if (input.hqCountry === rules.home) return { origin: 'local', basis: 'headquarters' };
  if (input.hqCountry === null && words(input.hqText).match(new RegExp(` (?:${alternation(homeCityNames)}) `))) return { origin: 'local', basis: 'headquarters' };

  const description = clean(input.description);
  const aboutItself = `${input.name}. ${description}`;
  if (statesBase(aboutItself, homePlaces) || words(aboutItself).includes(` a ${lookupKey(home.adjective)} `)) return { origin: 'registered-abroad', basis: 'described-here' };

  const hq = words(input.hqText);
  if (rules.registrationAddresses.some((r) => r.match.some((m) => hq.includes(` ${lookupKey(m)} `)))) return { origin: 'registered-abroad', basis: 'registration-address' };

  const abroad = [
    ...(input.hqCountryName ? [input.hqCountryName] : []),
    ...(input.hqCountry ? rules.abroadNames[input.hqCountry] ?? [] : []),
    ...input.hqText.split(',').map((p) => p.trim()).filter((p) => p.length >= 3 && !/\d/.test(p)),
  ];
  const describedAbroad = statesBase(aboutItself, abroad);

  // A company form of home in the company's own name or description is its registration at home. The
  // same form only on an office's label, beside a description that places the company abroad, is a
  // subsidiary at home of a company based abroad.
  const lower = (text: string) => ` ${text.toLowerCase().replace(/\s+/g, ' ')} `;
  const hasForm = (text: string) => home.companyForms.some((f) => lower(text).includes(f)) || home.bodies.some((b) => words(text).includes(` ${lookupKey(b)} `));
  const labels = input.officeAddresses.map((a) => a.split(',')[0]?.trim() ?? '');
  if (hasForm(aboutItself)) return { origin: 'registered-abroad', basis: 'company-form' };
  if (labels.some(hasForm)) return describedAbroad ? { origin: 'international', basis: 'described-abroad' } : { origin: 'registered-abroad', basis: 'company-form' };

  if (input.website) {
    try {
      const host = new URL(input.website).hostname;
      if (home.domains.some((d) => host.endsWith(d))) return { origin: 'registered-abroad', basis: 'website' };
    } catch {
      // A website that is not a URL gives no evidence.
    }
  }

  if (labels.some((l) => HEAD_OFFICE_LABEL.test(l))) return { origin: 'registered-abroad', basis: 'office-label' };
  if (describedAbroad) return { origin: 'international', basis: 'described-abroad' };
  return { origin: 'unclear', basis: 'none' };
}
