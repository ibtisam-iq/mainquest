import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { CompanyRecord } from '../../lib/types.ts';

// One record per line inside a JSON array: valid JSON, and a git diff shows exactly the records that changed.
export function serializeRecords(records: readonly CompanyRecord[]): string {
  return `[\n${records.map((r) => JSON.stringify(r)).join(',\n')}\n]\n`;
}

export function prettyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function sha256Hex(contents: string): string {
  return createHash('sha256').update(contents).digest('hex');
}

export function writeIfChanged(path: string, contents: string): 'written' | 'unchanged' {
  if (existsSync(path) && readFileSync(path, 'utf8') === contents) return 'unchanged';
  writeFileSync(path, contents);
  return 'written';
}
