import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildIndex, runSearch, type SearchDoc } from '../../lib/search-index.ts';
import { highlightParts, searchTerms } from '../../lib/highlight.ts';

const rules = JSON.parse(readFileSync(new URL('../ingest/rules/search-synonyms.json', import.meta.url), 'utf8'));
const doc = (id: string, over: Partial<SearchDoc>): SearchDoc => ({ id, name: id, industry: '', tags: '', place: '', website: '', specialties: '', address: '', ...over });
const index = buildIndex([
  doc('java-shop', { specialties: 'Java, Spring Boot' }),
  doc('js-shop', { specialties: 'JavaScript, React' }),
  doc('dotnet-shop', { specialties: 'C#, ASP.NET, SQL Server' }),
  doc('network-shop', { name: 'NetWave', specialties: 'Networking, Network security' }),
  doc('sector-office', { address: 'Office 3, F-7 Markaz, Islamabad' }),
  doc('block-office', { address: 'Block F, Street 7, DHA Phase 2, Islamabad' }),
  doc('node-dot', { specialties: 'Node.js, Express' }),
  doc('node-joined', { specialties: 'NodeJS' }),
  doc('node-name', { name: 'Node Labs' }),
  doc('node-apps', { name: 'Node Apps' }),
  doc('code-shop', { name: 'Code Hub', specialties: 'Code review' }),
  doc('k8s-shop', { specialties: 'Kubernetes, Docker' }),
], rules);
const find = (q: string) => runSearch(index, q).map((h) => h.handle).sort();

test('a word listed as exact never matches the start of a longer word', () => {
  assert.deepEqual(find('java'), ['java-shop']);
  assert.deepEqual(find('javascript'), ['js-shop']);
});

test('words written with symbols are searched as written', () => {
  assert.deepEqual(find('C#'), ['dotnet-shop']);
  assert.deepEqual(find('.net'), ['dotnet-shop']);
  assert.deepEqual(find('asp.net'), ['dotnet-shop']);
});

test('a sector is one word, however it is written', () => {
  for (const q of ['F-7', 'f7', 'F 7']) assert.deepEqual(find(q), ['sector-office'], q);
});

test('a JavaScript library matches in all its spellings', () => {
  assert.deepEqual(find('node.js'), ['node-dot', 'node-joined']);
  assert.deepEqual(find('nodejs'), ['node-dot', 'node-joined']);
});

test('a common word is never read as a typo, a rare one is', () => {
  assert.ok(!find('node').includes('code-shop'), 'node is a real word, so it does not find code');
  assert.deepEqual(find('kubernets'), ['k8s-shop']);
});

test('marks cover symbol words as written', () => {
  assert.deepEqual(searchTerms('C# .NET'), ['.net', 'c#']);
  assert.deepEqual(highlightParts('C#, ASP.NET', searchTerms('.net')).filter((p) => p.match).map((p) => p.text), ['.NET']);
  assert.deepEqual(highlightParts('F-7 Markaz', searchTerms('f 7')).filter((p) => p.match).map((p) => p.text), ['F-7']);
});
