// Writes the files the browser downloads, derived from the committed dataset.
// public/data/ is gitignored: it is rebuilt before every dev run and every build.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './ingest/env.ts';
import { splitPayload } from '../lib/payload.ts';
import type { CompanyRecord } from '../lib/types.ts';

const DATA = join(ROOT, 'data');
const OUT = join(ROOT, 'public/data');
const read = (file: string) => JSON.parse(readFileSync(join(DATA, file), 'utf8'));

const records: CompanyRecord[] = read('companies.json');
const { core, extra } = splitPayload(records);
const facets = {
  hubs: read('hubs.json'),
  industries: read('industries.json'),
  tags: read('tags.json'),
  areas: read('areas.json'),
  cities: read('cities.json'),
  countries: read('countries.json'),
  origins: read('origins.json'),
  // So the browser counts a specialty under the same tag the ingest did when it picks row chips.
  tagAliases: JSON.parse(readFileSync(join(ROOT, 'scripts/ingest/rules/tag-aliases.json'), 'utf8')).aliases,
};

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'core.json'), JSON.stringify(core));
writeFileSync(join(OUT, 'extra.json'), JSON.stringify(extra));
writeFileSync(join(OUT, 'facets.json'), JSON.stringify(facets));
console.log(`Published ${core.length} companies to public/data/.`);
