import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';

export interface ParsedFile {
  header: string[];
  rows: string[][];
}

// Rows are read as arrays, not objects, so no header string is ever used as a property name.
export function readDelimitedFile(path: string): ParsedFile {
  const records: string[][] = parse(readFileSync(path), { bom: true, skip_empty_lines: true });
  const [header, ...rows] = records;
  if (!header) throw new Error(`${path} is empty.`);
  rows.forEach((row, i) => {
    if (row.length !== header.length) throw new Error(`${path}: row ${i + 2} has ${row.length} fields, expected ${header.length}.`);
  });
  return { header, rows };
}
