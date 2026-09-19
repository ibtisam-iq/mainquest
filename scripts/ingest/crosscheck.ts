// Proves the ported classifiers agree with the upstream pipeline's own output files.
// Optional: runs only when the upstream slice files have been copied to data/raw/crosscheck/.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './env.ts';
import { readDelimitedFile } from './csv.ts';
import { assertHeader, toSourceRow } from './columns.ts';
import { extractHandle } from './handle.ts';
import type { CompanyRecord } from '../../lib/types.ts';

const DIR = join(ROOT, 'data/raw/crosscheck');
if (!existsSync(DIR)) {
  console.log('No cross-check files in data/raw/crosscheck/. Skipping; the pinned counts in the baseline still guard the classifiers.');
  process.exit(0);
}

const records: CompanyRecord[] = JSON.parse(readFileSync(join(ROOT, 'data/companies.json'), 'utf8'));

function handlesIn(file: string): Set<string> {
  const { header, rows } = readDelimitedFile(join(DIR, file));
  assertHeader(header);
  const out = new Set<string>();
  for (const raw of rows) {
    const h = extractHandle(toSourceRow(raw).profileUrl);
    if (h.ok && !h.subpage) out.add(h.handle);
  }
  return out;
}

const checks: [string, string, (r: CompanyRecord) => boolean][] = [
  ['local headquarters', 'local.csv', (r) => r.hq === 'local'],
  ['multi-city', 'multicity.csv', (r) => r.multiCity],
  ['hub twin-cities', 'hub-twin_cities.csv', (r) => r.hubs.includes('twin-cities')],
  ['hub lahore', 'hub-lahore.csv', (r) => r.hubs.includes('lahore')],
  ['hub karachi', 'hub-karachi.csv', (r) => r.hubs.includes('karachi')],
  ['hub faisalabad', 'hub-faisalabad.csv', (r) => r.hubs.includes('faisalabad')],
  ['hub other-cities', 'hub-other_cities.csv', (r) => r.hubs.includes('other-cities')],
];

let failed = 0;
for (const [label, file, pick] of checks) {
  const upstream = handlesIn(file);
  const ours = new Set(records.filter(pick).map((r) => r.handle));
  const missing = [...upstream].filter((h) => !ours.has(h)).length;
  const extra = [...ours].filter((h) => !upstream.has(h)).length;
  const ok = missing === 0 && extra === 0;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(20)} upstream ${String(upstream.size).padStart(5)}  mainquest ${String(ours.size).padStart(5)}${ok ? '' : `  missing ${missing}, extra ${extra}`}`);
}
if (failed) {
  console.error(`${failed} cross-check(s) failed.`);
  process.exit(1);
}
console.log('All classifications match the upstream files.');
