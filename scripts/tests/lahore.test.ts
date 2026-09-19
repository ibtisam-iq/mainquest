// Lahore's addresses, checked against the real rules files (decision 30). Each case is an address from the
// source, shortened; the traps are the many ways a DHA phase is written, buildings that stand for their
// area, offices abroad listed among the Pakistani ones, and an operating location that repeats an office's
// city under another name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { CityIndex, PlaceIndex, buildOffices, geocodeText, newOfficeStats } from '../ingest/offices.ts';

const rules = (name: string) => fileURLToPath(new URL(`../ingest/rules/${name}`, import.meta.url));
const cities = new CityIndex(rules('city-centroids.json'));
const places = new PlaceIndex(rules('places.json'));
const place = (text: string, city = 'lahore') => places.find(geocodeText(text), city)?.id ?? null;

test('a DHA phase is found however it is written', () => {
  assert.equal(place('Datum Brain, L-2, DHA Phase 6C, Lahore, 54000'), 'lahore:dha-phase-6');
  assert.equal(place('CCA, 101, Phase6, DHA, Lahore'), 'lahore:dha-phase-6');
  assert.equal(place('2nd Floor, 28 CCA Pahse 5, DHA, Lahore'), 'lahore:dha-phase-5');
  assert.equal(place('Head Office, 17A, XX Sector, Khayban-e-Iqbal, DHA PhaseIII, Lahore, 54500'), 'lahore:dha-phase-3');
  assert.equal(place('166 plaza c block commercial Broadway DHA PH 8 COMMERCIAL, LAHORE, 54000'), 'lahore:dha-phase-8');
  assert.equal(place('Headquarters, 247- Commercial, DHA IV, Lahore, 54660'), 'lahore:dha-phase-4');
  assert.equal(place('Operational Office, 38 A CCA, 1st Floor, Sector C Phase 5 D.H.A, Lahore, 54792'), 'lahore:dha-phase-5');
  // CCA, the central commercial area, is DHA's own.
  assert.equal(place('Headquarters, 17 CCA, Phase 4, Lahore'), 'lahore:dha-phase-4');
  assert.equal(place('APP IN SNAP - Karachi Office, 58-C, Shahbaz Commercial Area, Phase 6, Defense Housing Authority', 'karachi'), 'karachi:dha-phase-6');
  // A phase of another scheme is not a DHA phase.
  assert.equal(place('HeadOffice, 574, G-1 Block, Phase 1 Johar Town, Lahore'), 'lahore:johar-town');
  // "DHA 1 Sector F" and "Bahria Phase 7" in one address: the phase of Bahria Town that is written out wins.
  assert.equal(place('SoftAxes, Ground Floor Plaza B-42 DHA 1 Sector F Bahria Phase 7, islamabad', 'rawalpindi'), 'rawalpindi:bahria-town-phase-7');
});

test('a building or market that the addresses always write with its area stands for the area', () => {
  assert.equal(place('Siddiq Trade Center, Siddiq Trade Center Lahore, 54000'), 'lahore:gulberg');
  assert.equal(place('LG 40 IT Tower, Halli Road, Lahore, 54000'), 'lahore:gulberg');
  assert.equal(place('Pakistan Head Office, High Q Tower, Lahore, 54000'), 'lahore:gulberg');
  assert.equal(place('Silicon Village Lahore, 10th Floor, Tricon Corporate Tower'), 'lahore:gulberg');
  assert.equal(place('1012/10 Haly Tower, Lahore'), 'lahore:dha-phase-2');
  assert.equal(place('Central Plaza Lahore, 29-FF Barkat Market, New Gardentown'), 'lahore:garden-town');
  assert.equal(place('Office #362 H3-Block Opposite to Emporium Mall LHR 54000, Lahore'), 'lahore:johar-town');
  // Liberty Market has an area of its own, which the geocoder finds.
  assert.equal(place('Branch Office, Liberty Market, Lahore'), null);
  // Spellings.
  assert.equal(place('Jeff heights, Gulburg iii, P33, 2nd Floor, Lahore'), 'lahore:gulberg');
  assert.equal(place('Headquarters, Level1, 384 E, Ali Center, Johartown, Lahore'), 'lahore:johar-town');
  assert.equal(place('Sector D Crystal Mart First Floor Bharia Town Lahore, 54000'), 'lahore:bahria-town');
});

test('the neighbourhoods added for Lahore, and the smaller of two named places', () => {
  assert.equal(place('Headquarters, 3rd Floor, 10 Wahdat Road, Muslim Town, Lahore'), 'lahore:muslim-town');
  assert.equal(place('Lahore Office, 221 D PIA Society, 60000'), 'lahore:pia-housing-society');
  assert.equal(place('INFINITY-UP, Venture Drive 4th Floor, 51 C commercial, PIA Main Boulevard Lahore, 54770'), 'lahore:pia-housing-society');
  assert.equal(place('Headquarters, 440 J block commerical, DHA Phase 12, EME Sector, Lahore, 53710'), 'lahore:dha-phase-12');
  assert.equal(place('371-J Commercial DHA EME, Lahore, lahore, 54000'), 'lahore:dha-phase-12');
  assert.equal(place('Head Office, 14-Rehman Housing, st # 1 BOR Society, Johar town E Block, Lahore'), 'lahore:revenue-society');
  assert.equal(place('Canal View, House no. 219 - A, Canal View housing society near Thokar Niaz Baig, Lahore'), 'lahore:canal-view');
  assert.equal(place('Ali town, 166, Ali Town, Raiwind Road, Thokar Niaz Baig, Lahore, 53700'), 'lahore:ali-town');
  assert.equal(place('Headquarters, E 163/B Street 11, New Iqbal Park, Defence Main Boulevard, Lahore'), 'lahore:new-iqbal-park');
  // Places whose own lookups found nothing, or something else, are not in the list; their addresses fall
  // back to the geocoder or to city level.
  assert.equal(place('Headquarters, 9-A Aitchison society, Lahore, 53700'), null);
  assert.equal(place('27/ M, Sector 2. Phase XI DHA Rahbar, Lahore, 54000'), null);
});

test('a name that contains a place\'s own, somewhere else, is not that place', () => {
  assert.equal(place('Corporate Office, Al-Faisal Town, Lahore, 54800'), null);
  assert.equal(place('Headquarters, 1st Floor, Office No 2, A Extension, AL Rehman Garden Phase 2, Near Faizpur Interchange, Lahore'), null);
  // DHA Rahbar is Phase 11, with phases of its own.
  assert.equal(place('5cc DHA Rahbar Phase 1, Lahore, 54000'), null);
  // Defence Road runs past several schemes; only Defence the housing authority is DHA.
  assert.equal(place('Corporate Office, LC-67, Phase 2, Dreams Garden, Defense Road, Lahore, 54600'), null);
  assert.equal(place('Back Office, Defence, Phase VI, Karachi', 'karachi'), 'karachi:dha-phase-6');
  // Bahria Orchard is its own scheme, 8 km from Bahria Town.
  assert.equal(place('Headquarters, C-block, 34-C Plaza, 4th Floor, Bahria Orchard, Raiwind Road, Lahore'), 'lahore:bahria-orchard');
  assert.equal(place('Sector D Crystal Mart First Floor Bharia Town Lahore, 54000'), 'lahore:bahria-town');
});

test('a road is no area', () => {
  assert.equal(place('Headquarters, Office 12, Landmark Plaza, Jail Road, Lahore'), null);
  assert.equal(place('Headquarters, Main Multan Road, Lahore'), null);
});

test('an office outside Pakistan is recognised, and a Pakistani one that names a foreign place is not', () => {
  assert.equal(cities.abroad('Plot #63 Lumbini Ave, 2nd Floor,, Gachibowli Hyderabad, 500032'), true);
  assert.equal(cities.abroad('D3XTER Middle East, Sheikh Mohammed Bin Rashid Boulevard, Downtown, Boulevard Plaza Tower 1, Dubai, 413098'), true);
  assert.equal(cities.abroad('London'), true);
  assert.equal(cities.abroad('Hyderabad, Sindh, 71000'), false);
  assert.equal(cities.abroad('Dubai Plaza, 1st Floor, 6th Road, Rawalpindi, 46000'), false);
  assert.equal(cities.abroad('Doha, Qatar, Lahore'), false);
});

test('a city is read from the address first, and from the operating locations only when the address names none', () => {
  assert.equal(cities.choose('COMSATS University Islamabad, Lahore Campus'), 'lahore');
  assert.equal(cities.choose('Headquarters, F-1 Office Ghani Plaza Main Multan Roan Scheem More Lahore'), 'lahore');
  const ctx = {
    cities, places, areaAliases: {}, areaLabels: new Map(), cityNames: cities.names(),
    hubCities: { 'twin-cities': ['islamabad', 'rawalpindi'], lahore: ['lahore'], karachi: ['karachi'] },
    cache: { version: 1 as const, entries: {} },
  };
  const build = (officeAddress: string, operatingLocations: string) =>
    buildOffices({ officeAddress, operatingLocations, headquarters: '', hubs: new Set(['twin-cities', 'lahore', 'karachi']) }, ctx, newOfficeStats()).map((o) => o.city).sort();
  // The operating location names the office's city another way: one office, where the address says.
  assert.deepEqual(build('Street No 1, Phase - 2 Wah Model Town, Wah Cantt, Rawalpindi, 47040', 'Rawalpindi, Punjab'), ['wah']);
  assert.deepEqual(build('Headquarters, 8, Garden Town, Lahore, 54000 | #9, 2nd Floor, Gulf Plaza, Chandni Chowk, Rawalpindi', 'Lahore, Punjab; Islamabad'), ['lahore', 'rawalpindi']);
  // An address of city names alone locates nothing, so each city keeps its office.
  assert.deepEqual(build('Hyderabad/Karachi , Sindh', 'Karachi, Sindh'), ['hyderabad', 'karachi']);
  // An office abroad, and the city the source then lists for it, get no office.
  assert.deepEqual(build('Offshore, 117- Block P, M.M. Alam Road, Gulberg II, Lahore | Plot #63 Lumbini Ave, Gachibowli Hyderabad, 500032', 'Lahore, Punjab; Hyderabad, Sindh'), ['lahore']);
  // An address that names its city only in a longer phrase.
  assert.deepEqual(build('Lahore District', 'Islamabad; Karachi, Sindh; Lahore, Punjab'), ['islamabad', 'karachi', 'lahore']);
  // An address in a town no lookup knows gets no office, rather than the company's first city; the Wah Cantt
  // address accounts for Rawalpindi.
  assert.deepEqual(build('Head Office, Anas Plaza, G.T Road, Wah Cantt, Rawalpindi, 47040 | Techtis Solutions Sanawan, Office No. 2, Madina Plaza, 34100', 'Rawalpindi, Punjab; Sanawan, Punjab'), ['wah']);
});
