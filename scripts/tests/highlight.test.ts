import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasMatch, highlightParts, searchTerms } from '../../lib/highlight.ts';

test('search terms are lowercased, deduplicated, longest first, and skip single letters', () => {
  assert.deepEqual(searchTerms('Cloud  cloud a DevOps'), ['devops', 'cloud']);
});

test('highlight marks word starts only, ignoring case', () => {
  assert.deepEqual(highlightParts('Cloud Communication', ['comm']), [
    { text: 'Cloud ', match: false },
    { text: 'Comm', match: true },
    { text: 'unication', match: false },
  ]);
  assert.equal(hasMatch('Telecom', ['com']), false);
  assert.equal(hasMatch('AI/ML Platform', ['ml']), true);
  assert.deepEqual(highlightParts('Anything', []), [{ text: 'Anything', match: false }]);
});
