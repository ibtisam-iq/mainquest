import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractHandle } from '../ingest/handle.ts';

const base = 'https://profiles.example.test/company';

test('extracts the handle from a base profile URL', () => {
  assert.deepEqual(extractHandle(`${base}/acme-labs`), { ok: true, handle: 'acme-labs', subpage: false });
  assert.deepEqual(extractHandle(`${base}/Acme-Labs/`), { ok: true, handle: 'acme-labs', subpage: false });
  assert.deepEqual(extractHandle(`${base}/acme?trk=x`), { ok: true, handle: 'acme', subpage: false });
});

test('flags sub-page captures without a list of known suffixes', () => {
  assert.deepEqual(extractHandle(`${base}/acme/events`), { ok: true, handle: 'acme', subpage: true });
  assert.deepEqual(extractHandle(`${base}/acme/services/request-proposal`), { ok: true, handle: 'acme', subpage: true });
});

test('stores handles URL-encoded, so they are ASCII and link-ready', () => {
  const nbsp = extractHandle(`${base}/acme-private%C2%A0limited`);
  assert.equal(nbsp.ok && nbsp.handle, 'acme-private%C2%A0limited');
  const dash = extractHandle(`${base}/tech\u2013talk`);
  assert.equal(dash.ok && dash.handle, 'tech%E2%80%93talk');
});

test('rejects empty and malformed input', () => {
  assert.deepEqual(extractHandle('   '), { ok: false, reason: 'empty' });
  assert.deepEqual(extractHandle('https://example.test/about'), { ok: false, reason: 'no_company_segment' });
  assert.deepEqual(extractHandle(`${base}/has space`), { ok: false, reason: 'malformed' });
});
