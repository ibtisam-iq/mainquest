import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { classifyOrigin, loadOriginRules, type OriginInput } from '../ingest/origin.ts';

const rules = loadOriginRules(fileURLToPath(new URL('../ingest/rules/origin.json', import.meta.url)));
const cities = ['Lahore', 'Karachi', 'Islamabad', 'Rawalpindi', 'Skardu'];
const company = (over: Partial<OriginInput>): OriginInput => ({
  handle: 'acme', hqText: 'Austin, Texas', hqCountry: 'us', hqCountryName: 'United States', name: 'Acme', description: '', website: null, officeAddresses: ['Office 3, Johar Town, Lahore'], ...over,
});
const kind = (over: Partial<OriginInput>) => { const r = classifyOrigin(company(over), rules, cities); return `${r.origin}/${r.basis}`; };

test('a headquarters at home makes a company local, even when only a home city names it', () => {
  assert.equal(kind({ hqText: 'Lahore, Punjab', hqCountry: 'pk' }), 'local/headquarters');
  assert.equal(kind({ hqText: 'Skardu, Gilgit Baltistan', hqCountry: null, hqCountryName: null }), 'local/headquarters');
});

test('a company that says it is based at home is run from home, wherever it is registered', () => {
  assert.equal(kind({ description: 'Acme is a Lahore-based software house.' }), 'registered-abroad/described-here');
  assert.equal(kind({ description: 'We are headquartered in the heart of Rawalpindi, with a sales office in Texas.' }), 'registered-abroad/described-here');
  assert.equal(kind({ description: 'Headquartered in Sweden, with a dedicated team of developers based in Lahore.', hqText: 'Stockholm', hqCountry: 'se', hqCountryName: 'Sweden' }), 'international/described-abroad', 'a team at home is a part, not the company');
});

test('facts outweigh a description that calls the company based abroad', () => {
  const says = 'Acme is a US-based technology company.';
  assert.equal(kind({ description: says, hqText: 'Sheridan, Wyoming' }), 'registered-abroad/registration-address');
  assert.equal(kind({ description: says, name: 'Acme (Pvt) Ltd' }), 'registered-abroad/company-form');
  assert.equal(kind({ description: says, officeAddresses: ['Headquarters, Office 3, Blue Area, Islamabad'] }), 'registered-abroad/office-label');
  assert.equal(kind({ description: says }), 'international/described-abroad');
});

test('a company form only on an office, beside a base abroad, is a subsidiary of a company based abroad', () => {
  assert.equal(kind({ description: 'Acme is a UK-headquartered systems integrator.', hqText: 'London', hqCountry: 'gb', hqCountryName: 'United Kingdom', officeAddresses: ['Acme Services (Pvt.) Ltd, Gulberg, Lahore'] }), 'international/described-abroad');
  assert.equal(kind({ officeAddresses: ['Acme Services (Pvt.) Ltd, Gulberg, Lahore'] }), 'registered-abroad/company-form');
});

test('clients and teams abroad say nothing about where the company is', () => {
  assert.equal(kind({ description: 'We serve clients based in the US, with the majority being UK based.' }), 'unclear/none');
  assert.equal(kind({ description: 'Our UK-based leadership team works with global partners.', hqText: 'London', hqCountry: 'gb', hqCountryName: 'United Kingdom' }), 'unclear/none');
});

test('a .pk website counts, and with no evidence the answer is unclear', () => {
  assert.equal(kind({ website: 'https://acme.com.pk/' }), 'registered-abroad/website');
  assert.equal(kind({}), 'unclear/none');
});

test('a company settled by hand keeps that answer', () => {
  assert.equal(kind({ handle: 'venturedive' }), 'registered-abroad/owner');
  assert.equal(kind({ handle: 'bayt.com', hqText: 'Dubai', hqCountry: 'ae' }), 'international/owner');
});
