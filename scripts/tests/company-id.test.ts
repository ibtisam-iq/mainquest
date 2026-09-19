import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HeaderMismatchError, assertHeader, toSourceRow } from '../ingest/columns.ts';
import { parseCompanyId, sharedIdHandles } from '../ingest/fields.ts';

test('company id: digits only', () => {
  assert.equal(parseCompanyId('2529067'), '2529067');
  assert.equal(parseCompanyId(' 2529067 '), '2529067');
  assert.equal(parseCompanyId(''), null);
  assert.equal(parseCompanyId('0'), null);
  assert.equal(parseCompanyId('25290a7'), null);
  assert.equal(parseCompanyId('https://example.com/?currentCompany=2529067'), null);
});

test('the source loads with or without the trailing Company ID column', () => {
  // The real header texts, with a neutral stand-in for the profile URL column.
  const real = ['Company Name', 'Tagline', 'Website', 'Example Profile URL', 'Industry', 'Company Size', 'Associated Members', 'Founded', 'Company Type', 'Specialties', 'Global Headquarters', 'Operating Location (Pakistan)', 'Pakistan Office Full Address', 'Followers', 'Verified', 'Open Jobs URL', 'People / HRs URL', 'All Office Locations URL', 'Description', 'Date Discovered'];
  assert.doesNotThrow(() => assertHeader(real));
  assert.doesNotThrow(() => assertHeader([...real, 'Company ID']));
  assert.throws(() => assertHeader([...real, 'Something Else']), HeaderMismatchError);
  assert.throws(() => assertHeader([...real, 'Company ID', 'Extra']), HeaderMismatchError);
  assert.throws(() => assertHeader(real.slice(0, 19)), HeaderMismatchError);
  const row = toSourceRow([...real.map(() => ''), '2529067']);
  assert.equal(row.companyId, '2529067');
  assert.equal(toSourceRow(real.map(() => '')).companyId, '');
});

test('associated members link: the filtered search with an id, the members page without', async () => {
  process.env.NEXT_PUBLIC_PROFILE_BASE_URL = 'https://profiles.example/company/';
  const { membersUrl } = await import('../../lib/links.ts');
  assert.equal(membersUrl('cequens', '2529067'), 'https://profiles.example/search/results/people/?currentCompany=%5B%222529067%22%5D');
  assert.equal(membersUrl('cequens', null), 'https://profiles.example/company/cequens/people/');
});

test('company id: an id two companies share is kept by neither', () => {
  const shared = sharedIdHandles([
    { handle: 'wibbow-technologies-limited', companyId: '90356768' },
    { handle: 'wibbowtech', companyId: '90356768' },
    { handle: 'cequens', companyId: '2529067' },
    { handle: 'no-id', companyId: null },
  ]);
  assert.deepEqual([...shared].sort(), ['wibbow-technologies-limited', 'wibbowtech']);
});
