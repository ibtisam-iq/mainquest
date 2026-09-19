import { readFileSync } from 'node:fs';
import { clean, compareAscii, lookupKey, slugify, tokenText } from '../../lib/text.ts';
import { haversineKm, insidePakistan, round5 } from '../../lib/geo.ts';
import type { Office, Precision } from '../../lib/types.ts';
import type { HubId } from './classify.ts';

// ---------- city lookup ----------

export interface CityEntry {
  label: string;
  lat: number;
  lon: number;
  keywords: string[];
  // Places inside the city whose names stand for it only when an address names no city: "Tariq Road"
  // alone is in Karachi, but "Tariq Road, Faisalabad" is in Faisalabad, which has one too.
  neighbourhoods?: string[];
  postalPrefixes: string[];
  // The larger city a town is written with ("Wah Cantt, Rawalpindi"): when both are named, the town wins.
  within?: string;
  // Learned from the data rather than kept by hand. Such a city is recognised only as a whole part
  // of an address ("..., Sahiwal, 57000"), never inside a longer phrase.
  learned?: boolean;
}

// A city's name followed by one of these words names a road, a market or a region rather than the
// city: an office on "Peshawar Road, Rawalpindi" is in Rawalpindi.
const NOT_THE_CITY = /^(road|rd|raod|roan|highway|hwy|expressway|motorway|bypass|by pass|chowk|stop|link|mor|more|company|baltistan|division|district)\b/;

// The part of an address with its postal code taken off, for comparing whole parts.
const segmentKey = (segment: string) => lookupKey(segment).replace(/\s*\d{5}$/, '').trim();

export class CityIndex {
  readonly entries: Record<string, CityEntry>;
  private readonly keywords: { token: string; id: string }[];
  private readonly neighbourhoods: { token: string; id: string }[];
  private readonly learnedKeys = new Map<string, string>();
  private readonly postal = new Map<string, string>();
  private readonly roadTowns: string[];
  private readonly abroadNames: Set<string>;

  constructor(path: string, learned: LearnedCities = { cities: {}, spellings: {} }) {
    const table = JSON.parse(readFileSync(path, 'utf8'));
    const kept: Record<string, CityEntry> = table.cities;
    this.roadTowns = ((table.roadTowns ?? []) as string[]).map((t) => lookupKey(t));
    this.abroadNames = new Set(((table.abroad ?? []) as string[]).map((t) => lookupKey(t)));
    // A hand-kept entry always wins over a learned one with the same id.
    this.entries = { ...learned.cities, ...kept };
    this.keywords = Object.entries(kept)
      .flatMap(([id, c]) => c.keywords.map((k) => ({ token: ` ${lookupKey(k)} `, id })))
      .sort((a, b) => b.token.length - a.token.length || compareAscii(a.token, b.token));
    this.neighbourhoods = Object.entries(kept)
      .flatMap(([id, c]) => (c.neighbourhoods ?? []).map((k) => ({ token: ` ${lookupKey(k)} `, id })))
      .sort((a, b) => b.token.length - a.token.length || compareAscii(a.token, b.token));
    for (const [id, c] of Object.entries(this.entries)) if (c.learned) for (const k of c.keywords) this.learnedKeys.set(lookupKey(k), id);
    for (const [spelling, id] of Object.entries(learned.spellings)) if (this.entries[id]) this.learnedKeys.set(lookupKey(spelling), id);
    for (const [id, c] of Object.entries(kept)) for (const prefix of c.postalPrefixes) this.postal.set(prefix, id);
  }

  // Every city the text names, in order of first mention, leaving out names used for a road or a region.
  // A neighbourhood's name counts for its city only when the text names no city at all.
  mentions(text: string): string[] {
    const hay = tokenText(text);
    const found = new Map<string, number>();
    // "Lahore - Sheikhupura - Faisalabad Rd" is one road: a chain of city names ending in a road word.
    const cityWords = [...this.keywords.map((k) => k.token.trim()), ...this.learnedKeys.keys(), ...this.roadTowns];
    const afterChain = (rest: string) => {
      let r = rest.trimStart();
      for (let moved = true; moved;) {
        moved = false;
        for (const w of cityWords) if (r.startsWith(`${w} `)) { r = r.slice(w.length).trimStart(); moved = true; }
      }
      return r;
    };
    const scan = (list: { token: string; id: string }[]) => {
      for (const { token, id } of list) {
        for (let pos = hay.indexOf(token); pos !== -1; pos = hay.indexOf(token, pos + 1)) {
          if (NOT_THE_CITY.test(afterChain(hay.slice(pos + token.length)))) continue;
          if (!found.has(id) || pos < found.get(id)!) found.set(id, pos);
          break;
        }
      }
    };
    scan(this.keywords);
    // A learned city is a whole part of the address, or ends one ("Abbottabad Road Mansehra").
    for (const segment of text.split(/[,|;]/)) {
      const key = segmentKey(segment);
      for (const [name, id] of this.learnedKeys) {
        if (found.has(id) || !(key === name || key.endsWith(` ${name}`))) continue;
        found.set(id, hay.indexOf(` ${key} `) + key.length - name.length);
      }
    }
    if (found.size === 0) scan(this.neighbourhoods);
    return [...found].sort((a, b) => a[1] - b[1] || compareAscii(a[0], b[0])).map(([id]) => id);
  }

  // The city an address is in. When it names several, a well-known place in the text settles it, then
  // the postal code, then a town written with its larger city, then a campus named after its city
  // ("COMSATS University Islamabad, Lahore Campus"), and otherwise the first one named.
  choose(text: string, placeCity?: (text: string, candidates: string[]) => string | null): string | null {
    const named = this.mentions(text);
    if (named.length === 0) return this.byPostalCode(text);
    if (named.length === 1) return named[0];
    const byPlace = placeCity?.(text, named) ?? null;
    if (byPlace) return byPlace;
    const byCode = this.byPostalCode(text);
    if (byCode && named.includes(byCode)) return byCode;
    const town = named.find((id) => { const larger = this.entries[id].within; return larger !== undefined && named.includes(larger); });
    const hay = tokenText(text);
    const campus = named.find((id) => this.entries[id].keywords.some((k) => hay.includes(` ${lookupKey(k)} campus `)));
    return town ?? campus ?? named[0];
  }

  // An office outside Pakistan, which the source sometimes lists among the Pakistani ones: an address that
  // names a foreign country or city as a whole part and no Pakistani city ("..., Dubai, 413098"), or India's
  // Hyderabad, told from Sindh's by its six-digit postal code ("Gachibowli Hyderabad, 500032").
  abroad(text: string): boolean {
    if (/\bhyderabad\b.*\b5\d{5}\b/i.test(text)) return true;
    if (this.mentions(text).length > 0) return false;
    return text.split(',').some((segment) => this.abroadNames.has(segmentKey(segment)));
  }

  // The region encoded in a five-digit postal code, for text that names no city.
  private byPostalCode(text: string): string | null {
    const code = /\b(\d{2})\d{3}\b/.exec(text);
    return code ? (this.postal.get(code[1]) ?? null) : null;
  }

  // Every name that stands for a city, folded, so no city is ever taken for an area. Neighbourhoods are
  // left out: they are areas, and a lookup may name them as such.
  names(): Set<string> {
    const out = new Set<string>();
    for (const c of Object.values(this.entries)) for (const k of [c.label, ...c.keywords]) out.add(lookupKey(k));
    return out;
  }

  centroid(id: string): CityEntry {
    const c = this.entries[id];
    if (!c) throw new Error(`No centroid for city "${id}".`);
    return c;
  }
}

// ---------- cities learned from the data ----------

// Looked up as a structured search (city and country), which returns the town itself rather than, say, its railway station.
export const CITY_KEY = (name: string) => `city|${lookupKey(name)}`;

const PROVINCE = /^(punjab|sindh|khyber pakhtunkhwa|kpk|kp|balochistan|baluchistan|gilgit baltistan|azad kashmir|azad jammu and kashmir|ajk)$/;
const NOT_A_CITY_NAME = /remote|unlisted|original search|pakistan|federal|capital|territory|headquarters?|office|\b(block|sector|phase|street|road|plaza|floor|town|society|colony|greens|gardens|enclave|scheme|housing)\b|\d/i;

// Names written where a city goes: the first part of each operating location ("Sahiwal, Punjab"), and
// in an address, a part followed by a province ("..., Sahiwal, Punjab").
export function cityNameCandidates(operatingLocations: string, officeAddress: string): string[] {
  const out: string[] = [];
  for (const location of operatingLocations.split(';')) out.push(clean(location.split(',')[0] ?? ''));
  for (const part of splitAddress(officeAddress)) {
    const segments = part.split(',').map(clean).filter(Boolean);
    for (let i = 0; i + 1 < segments.length; i++) if (PROVINCE.test(segmentKey(segments[i + 1]))) out.push(segments[i]);
  }
  return out.filter((n) => n.length >= 3 && n.length <= 40 && !NOT_A_CITY_NAME.test(n) && !PROVINCE.test(lookupKey(n)));
}

// A lookup result that is a city or town in Pakistan, not a district, a suburb or a village.
const CITY_TYPES = new Set(['city', 'town', 'municipality']);
export function isCityResult(hit: GeoHit): boolean {
  return CITY_TYPES.has(hit.type) && hit.cc === 'pk' && insidePakistan(hit.lat, hit.lon);
}

// A confirmed place this close to a city in the table is part of it, or that city misspelt.
const SAME_CITY_KM = 15;

export interface LearnedCities {
  cities: Record<string, CityEntry>;
  // Other spellings of cities in the table ("Queta"), matched as whole address parts.
  spellings: Record<string, string>;
}

// Cities the hand-kept table lacks, from names in the data that the geocoder confirmed as a city or
// town. Several spellings that resolve to the same place become one city; a place at or near a city
// in the table becomes another spelling of that city.
export function learnCities(names: Iterable<string>, cache: GeoCache, known: CityIndex): LearnedCities {
  const byId = new Map<string, { hit: GeoHit; spellings: Map<string, number> }>();
  const spellings: Record<string, string> = {};
  for (const name of names) {
    if (known.mentions(name).length > 0 || PROVINCE.test(lookupKey(name))) continue;
    const hit = cache.entries[CITY_KEY(name)];
    if (!isHit(hit) || !isCityResult(hit)) continue;
    const id = slugify(hit.name ?? name);
    if (!id) continue;
    const nearest = Object.entries(known.entries)
      .map(([cid, c]) => ({ cid, km: haversineKm(hit.lat, hit.lon, c.lat, c.lon) }))
      .sort((a, b) => a.km - b.km)[0];
    if (known.entries[id] || (nearest && nearest.km <= SAME_CITY_KM)) {
      spellings[name] = known.entries[id] ? id : nearest.cid;
      continue;
    }
    const e = byId.get(id) ?? { hit, spellings: new Map<string, number>() };
    e.spellings.set(name, (e.spellings.get(name) ?? 0) + 1);
    byId.set(id, e);
  }
  const cities: Record<string, CityEntry> = {};
  for (const [id, { hit, spellings: written }] of [...byId].sort((a, b) => compareAscii(a[0], b[0]))) {
    cities[id] = { label: clean(hit.name ?? [...written.keys()][0]), lat: hit.lat, lon: hit.lon, keywords: [...written.keys()].sort(compareAscii), postalPrefixes: [], learned: true };
  }
  return { cities, spellings };
}

// ---------- geocoding cache ----------

export interface GeoHit {
  lat: number;
  lon: number;
  type: string;
  cat: string;
  area: string | null;
  place: string | null;
  cc: string | null;
  country: string | null;
  q: number;
  // The result's own name, and the names of the areas around it, most specific first. Entries looked
  // up before these were stored lack them, and are looked up again when an office depends on them.
  name?: string | null;
  areas?: string[];
}
export type GeoEntry = GeoHit | { miss: true };
export interface GeoCache {
  version: 1;
  entries: Record<string, GeoEntry>;
}

export const OFFICE_KEY = (address: string) => `o|${lookupKey(geocodeText(address))}`;
export const HQ_KEY = (hq: string) => `h|${lookupKey(hq)}`;

export function isHit(entry: GeoEntry | undefined): entry is GeoHit {
  return entry !== undefined && !('miss' in entry);
}

const STREET_TYPES = new Set(['building', 'house', 'road', 'amenity', 'office', 'shop', 'tourism', 'leisure', 'craft', 'man_made', 'commercial', 'retail', 'industrial', 'place_of_worship', 'highway', 'healthcare', 'education', 'club', 'historic', 'emergency']);
// A postcode result is deliberately absent: it is the centre of a postal zone, often several kilometres
// across, so it says no more than the city does.
const AREA_TYPES = new Set(['suburb', 'neighbourhood', 'quarter', 'city_district', 'residential', 'hamlet', 'village', 'borough', 'city_block', 'allotments', 'isolated_dwelling', 'plot', 'locality', 'square', 'farm']);

export function precisionOf(hit: GeoHit): Precision {
  if (STREET_TYPES.has(hit.type) || hit.cat === 'highway' || hit.cat === 'building') return 'street';
  if (AREA_TYPES.has(hit.type)) return 'area';
  return 'city';
}

// Results further than this from the office's own city are treated as wrong matches.
export const MAX_KM_FROM_CITY = 40;

// ---------- well-known places ----------

export interface Place {
  id: string;
  label: string;
  cities: string[];
  query: string;
  match: string[][];
  // Names that contain the place's own but are somewhere else ("Al-Faisal Town" is not Faisal Town): an
  // address naming one of these does not match the place.
  except?: string[];
  point?: [number, number];
  pointNote?: string;
}

// Keyed by the query too, so editing a place's query triggers a fresh lookup.
export const PLACE_KEY = (place: Place) => `p|${place.id}|${lookupKey(place.query)}`;

// An OpenStreetMap street result is trusted only this close to the place the address names.
export const STREET_AGREEMENT_KM = 1.5;
const PLACE_MAX_KM_FROM_CITY = 45;

export class PlaceIndex {
  readonly places: Place[];
  private readonly compiled: { place: Place; except: string[]; alternatives: { phrases: string[]; weight: number }[] }[];

  constructor(path: string) {
    this.places = JSON.parse(readFileSync(path, 'utf8')).places;
    this.compiled = this.places.map((place) => ({
      place,
      except: (place.except ?? []).map((p) => placeText(p)),
      alternatives: place.match.map((all) => {
        const phrases = all.map((p) => placeText(p));
        return { phrases, weight: phrases.reduce((n, p) => n + p.length, 0) };
      }),
    }));
  }

  // The most specific place named in the text, among places belonging to the given city.
  find(text: string, city: string): Place | null {
    const hay = placeText(text);
    let best: { place: Place; weight: number } | null = null;
    for (const { place, except, alternatives } of this.compiled) {
      if (!place.cities.includes(city) || except.some((p) => hay.includes(p))) continue;
      for (const alt of alternatives) {
        if (alt.phrases.every((p) => hay.includes(p)) && (best === null || alt.weight > best.weight)) best = { place, weight: alt.weight };
      }
    }
    return best?.place ?? null;
  }

  label(id: string): string | null {
    return this.places.find((p) => p.id === id)?.label ?? null;
  }
}

// A place's centre, if its own lookup found something more specific than a whole city, near one of its cities.
// Places accept more result types than office addresses do: a district, a marker or a park named after
// the place is a good centre for it, where the same result for a street address would be too vague.
const NOT_A_PLACE = new Set(['city', 'state', 'county', 'country', 'region', 'province', 'municipality', 'construction', 'railway']);

export function placePoint(place: Place, cache: GeoCache, cities: CityIndex): { lat: number; lon: number } | null {
  if (place.point) return { lat: place.point[0], lon: place.point[1] };
  const hit = cache.entries[PLACE_KEY(place)];
  if (!isHit(hit) || NOT_A_PLACE.has(hit.type) || !insidePakistan(hit.lat, hit.lon)) return null;
  const near = place.cities.some((c) => haversineKm(hit.lat, hit.lon, cities.centroid(c).lat, cities.centroid(c).lon) <= PLACE_MAX_KM_FROM_CITY);
  return near ? { lat: hit.lat, lon: hit.lon } : null;
}

// ---------- address text ----------

export function splitAddress(raw: string): string[] {
  return raw.split(/\s*\|\s*/).map(clean).filter(Boolean);
}

const NO_STREET_SUFFIX = /\s*\(no street address listed on [^)]*\)\s*$/i;
const PLACEHOLDER = /^(headquarters|none listed on page|pakistan|n\/?a|-+)$/i;
const ERRORISH = /^(error\b|extraction error)/i;

export function cleanAddress(part: string): string | null {
  const text = clean(
    clean(part)
      .replace(NO_STREET_SUFFIX, '')
      .replace(/https?:\/\/\S+/gi, '')
      .replace(/\bwww\.\S+/gi, '')
      .replace(/\s*,(\s*,)+/g, ','),
  ).replace(/^[,\s]+|[,\s]+$/g, '');
  if (!text || PLACEHOLDER.test(text) || ERRORISH.test(text)) return null;
  return text;
}

// Leading segments that label an office rather than locate it, such as "Headquarters" or
// "Lahore Office". A geocoder matches these against building names, so they are removed first.
const LABEL_SEGMENT = /^(pakistan\s+)?((head|main|regional|branch|sub|back|development|offshore|registered|corporate|global|international|primary|local|liaison|sales|operations?|delivery|tech|technology|software|engineering|r&d)\s*)*(office|offices|headquarters?|hq|headoffice|cent(er|re)|branch|campus|hub)$/i;
const CITY_LABEL_SEGMENT = /^[a-zÀ-ɏ ]+\s+(office|branch|headquarters?|hq|campus)$/i;
const UNIT_SEGMENT = /^((\d+(st|nd|rd|th)|ground|first|second|third|fourth|fifth|sixth|top|mezzanine|basement|lower ground|upper ground)\s+floor|floor\s*(no\.?|#)?\s*\d+|(suite|unit|room|flat|shop|office)\s*(no\.?|#)?\s*[\w/-]+)$/i;

export function geocodeText(address: string): string {
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  while (parts.length > 1 && (/^pakistan$/i.test(parts[0]) || LABEL_SEGMENT.test(parts[0]) || CITY_LABEL_SEGMENT.test(parts[0]) || UNIT_SEGMENT.test(parts[0]))) parts.shift();
  return parts.join(', ');
}

const DETAIL = /\b(floor|plaza|road|rd|street|st|sector|phase|block|building|tower|avenue|ave|center|centre|complex|suite|nastp|nstp|dha|bahria|blue area|[a-i]-\d{1,2}|pwd|soan|gulberg|cantt|cantonment|saddar|commercial|town|society|colony|market|mall|park|lane|gali|mohalla|chowk|clifton|pechs|shahrah|johar|defence|defense|garden|gardens|plot|house|flat|markaz|scheme|estate|arcade|centrum|industrial|arfa)\b/i;

// True when the text, once office labels are removed, says more than a city, region or postal code.
export function isDetailedAddress(address: string): boolean {
  return DETAIL.test(geocodeText(address));
}

const AREA_WORD = /\b(sector|phase|block|town|society|colony|dha|bahria|gulberg|johar|markaz|[a-i]-\d{1,2}|blue area|cantt|cantonment|saddar|clifton|pechs|garden|gardens|scheme|defence|defense|nastp|nstp|arfa|estate|industrial|commercial)\b/i;

// The retry query: only the segments that name an area, plus the city.
export function fallbackQuery(address: string, cityLabel: string | null): string | null {
  const text = geocodeText(address);
  const parts = text.split(',').map((p) => p.trim()).filter(Boolean);
  let tail = parts.filter((p) => AREA_WORD.test(p));
  if (tail.length === 0) tail = parts.slice(-2);
  if (cityLabel && !tail.some((p) => lookupKey(p).includes(lookupKey(cityLabel)))) tail.push(cityLabel);
  const q = tail.join(', ');
  return q && q !== text ? q : null;
}

// ---------- agreement between a lookup result and the address ----------

const ROMAN: Record<string, string> = { i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10', xi: '11', xii: '12', xiii: '13' };
const ROMAN_NUMBER = 'xiii|xii|xi|viii|vii|vi|iv|ix|x|v|iii|ii|i';

// Folded text with common spellings made equal, so "Ph II", "PhaseII", "Pahse 2" and "Phase 2" compare the same.
export function agreementText(value: string): string {
  const text = lookupKey(value)
    .replace(/\b(ph|pahse|phse)\b/g, 'phase')
    .replace(/\bsec\b/g, 'sector')
    .replace(new RegExp(`\\bphase(\\d{1,2}|${ROMAN_NUMBER})\\b`, 'g'), 'phase $1')
    .replace(new RegExp(`\\bphase (${ROMAN_NUMBER})\\b`, 'g'), (_, r: string) => `phase ${ROMAN[r]}`);
  return ` ${text} `;
}

// Text for finding well-known places: agreement text, with "D.H.A." read as DHA, "Defense" as "Defence",
// Bahria's common misspellings as Bahria, and a phase's sub-block letter dropped ("Phase 6C" is part of Phase 6).
export function placeText(value: string): string {
  return agreementText(value)
    .replace(/ d h a /g, ' dha ')
    .replace(/ defense /g, ' defence ')
    .replace(/ (behria|bahira|bharia|bahriya|baharia)(?= )/g, ' bahria')
    // Defence Road runs past several schemes; only Defence the housing authority stands for DHA.
    .replace(/ defence (road|rd|mor|more|chowk)(?= )/g, ' $1')
    .replace(/ phase (\d{1,2})[a-h](?= )/g, ' phase $1');
}

// Names too general to confirm a position on their own.
// A bare "Sector C" or "Block 5" is one of many in any city, so it names no area on its own, and a
// result named only "office" or "plaza" names no particular building. DHA alone spans a dozen phases
// across 20 km of Lahore or Karachi, so it names no area either.
const GENERAL_NAME = /^(pakistan|punjab|sindh|road|main road|street|city|town|market|chowk|commercial|commercial area|commercial zone|civic center|civic centre|industrial area|downtown|cantonment|cantt|dha|defence|defense|defence housing authority|defense housing authority|sector|phase|block|office|offices|head office|building|plaza|tower|mall|center|centre|complex|house|canal|(sector|block|phase|street|lane) [a-z0-9]{1,3}|[a-z0-9]{1,3} (sector|block|phase|street|lane))$/;

// The first of the given names, most specific first, that the address itself contains. A lookup
// result is trusted only through such a name: the geocoder can return a real place that is not the
// one the address means, and a shared name is the evidence that it is the same place.
export function agreeingName(names: readonly (string | null | undefined)[], address: string, cityNames: ReadonlySet<string>): string | null {
  const hay = agreementText(address);
  for (const name of names) {
    if (!name) continue;
    const key = agreementText(name).trim();
    if (key.length < 3 || GENERAL_NAME.test(key) || cityNames.has(key)) continue;
    if (hay.includes(` ${key} `)) return clean(name);
  }
  return null;
}

// The name that makes a lookup result a street position: the result's own name, written in the address,
// naming something more specific than the area. A land-use area (a market zone, an industrial estate,
// a housing scheme's outline) is an area however it is named, and a result named after the area itself
// ("I-8 Markaz" for an address that says only "I-8 Markaz") says no more than the area does.
export function streetName(entry: GeoHit, address: string, areaNames: readonly string[], cityNames: ReadonlySet<string>): string | null {
  if (precisionOf(entry) !== 'street' || entry.cat === 'landuse') return null;
  const own = agreeingName([entry.name], address, cityNames);
  if (!own) return null;
  const key = agreementText(own).trim();
  const isArea = areaNames.some((a) => { const k = agreementText(a).trim(); return k === key || k.includes(key) || key.includes(k); });
  return isArea ? null : own;
}

// ---------- office assembly ----------

export interface OfficeContext {
  cities: CityIndex;
  places: PlaceIndex;
  cache: GeoCache;
  areaAliases: Record<string, string>;
  areaLabels: Map<string, Map<string, number>>;
  hubCities: Record<HubId, string[]>;
  cityNames: ReadonlySet<string>;
}

export interface OfficeStats {
  detailedAddresses: number;
  geocoded: number;
  uncached: number;
  rejectedFar: number;
  cityLevelOnlyResult: number;
  notInAddress: number;
  unlocatedCompanies: number;
  placedByKnownPlace: number;
  streetConfirmedByPlace: number;
  abroad: number;
  operatingCityReplaced: number;
  unknownPlace: number;
}

export function newOfficeStats(): OfficeStats {
  return { detailedAddresses: 0, geocoded: 0, uncached: 0, rejectedFar: 0, cityLevelOnlyResult: 0, notInAddress: 0, unlocatedCompanies: 0, placedByKnownPlace: 0, streetConfirmedByPlace: 0, abroad: 0, operatingCityReplaced: 0, unknownPlace: 0 };
}

// For an address that names no city: the city of the company's hub that its text names first, or the hub's first city.
function hubDefaultCity(ctx: OfficeContext, hubs: ReadonlySet<HubId>, text: string): string | null {
  const named = ctx.cities.mentions(text);
  for (const [hub, cities] of Object.entries(ctx.hubCities)) {
    if (!hubs.has(hub) || cities.length === 0) continue;
    return named.find((c) => cities.includes(c)) ?? cities[0];
  }
  return null;
}

// Settles an address that names several cities by a well-known place it names, when only one of them has one.
function placeCity(ctx: OfficeContext): (text: string, candidates: string[]) => string | null {
  return (text, candidates) => {
    const cleaned = geocodeText(text);
    const withPlace = candidates.filter((c) => ctx.places.find(cleaned, c) !== null);
    return withPlace.length === 1 ? withPlace[0] : null;
  };
}

export function officeCity(ctx: OfficeContext, text: string): string | null {
  return ctx.cities.choose(text, placeCity(ctx));
}

// For an address that names no city the way an address does: the one operating-location city whose name it
// still contains ("Lahore District", "Okara Campus", "Gujar Khan Office").
function operatingCityNamed(ctx: OfficeContext, text: string, operating: readonly string[]): string | null {
  const hay = tokenText(text);
  const named = operating.filter((id) => { const c = ctx.cities.centroid(id); return [c.label, ...c.keywords].some((k) => hay.includes(` ${lookupKey(k)} `)); });
  return named.length === 1 ? named[0] : null;
}

function areaId(ctx: OfficeContext, city: string, label: string | null): string | null {
  if (!label) return null;
  // Compared the way names are, so "Phase II" and "Phase 2" are one area.
  const slug = slugify(agreementText(label));
  // Labels such as "13" name nothing a visitor would recognise.
  if (!slug || slug === city || /^[0-9-]+$/.test(slug)) return null;
  const raw = `${city}:${slug}`;
  const id = ctx.areaAliases[raw] ?? raw;
  const counts = ctx.areaLabels.get(id) ?? new Map<string, number>();
  counts.set(clean(label), (counts.get(clean(label)) ?? 0) + 1);
  ctx.areaLabels.set(id, counts);
  return id;
}

function cityOffice(ctx: OfficeContext, city: string, address: string | null): Office {
  const c = ctx.cities.centroid(city);
  return { city, area: null, lat: round5(c.lat), lon: round5(c.lon), precision: 'city', address };
}

const PRECISION_RANK: Record<Precision, number> = { street: 0, area: 1, city: 2 };

export interface OfficeInput {
  officeAddress: string;
  operatingLocations: string;
  headquarters: string;
  hubs: ReadonlySet<HubId>;
}

// A geocoder result for a detailed address, kept only when it shares a name with the address. An area
// name in the address that the result lies in gives the area and area precision; street precision also
// needs the result's own name (a building, or a road inside that area) in the address.
function placedByLookup(entry: GeoHit, part: string, city: string, ctx: OfficeContext): Office | null {
  const precision = precisionOf(entry);
  const areaNames = entry.areas ?? [entry.area];
  // A land-use area named in the address is an area too, like a suburb.
  const area = agreeingName(precision === 'area' || entry.cat === 'landuse' ? [entry.name, ...areaNames] : areaNames, part, ctx.cityNames);
  const own = streetName(entry, part, area ? [area] : [], ctx.cityNames);
  const isRoad = entry.cat === 'highway';
  let kept: Precision | null = null;
  if (own && (!isRoad || area)) kept = 'street';
  else if (area) kept = 'area';
  if (!kept) return null;
  return { city, area: areaId(ctx, city, area), lat: round5(entry.lat), lon: round5(entry.lon), precision: kept, address: part };
}

export function buildOffices(input: OfficeInput, ctx: OfficeContext, stats: OfficeStats): Office[] {
  const listed = splitAddress(input.officeAddress).map(cleanAddress).filter((p): p is string => p !== null);
  const parts = listed.filter((p) => !ctx.cities.abroad(p));
  stats.abroad += listed.length - parts.length;
  // A city named only by an office abroad ("Gachibowli Hyderabad"), which the source then lists among the
  // operating locations, gets no office either.
  const abroadCities = new Set(listed.filter((p) => ctx.cities.abroad(p)).flatMap((p) => ctx.cities.mentions(p)));
  const opCities = [...new Set(input.operatingLocations.split(';').map((s) => ctx.cities.choose(s)).filter((c): c is string => c !== null))];
  const context = `${input.operatingLocations} ${input.officeAddress} ${input.headquarters}`;
  const defaultCity = opCities[0] ?? hubDefaultCity(ctx, input.hubs, context) ?? ctx.cities.choose(input.headquarters);

  // Places the operating locations name that no city lookup knows ("Sanawan, Punjab"). An address that names
  // one and no known city is in that place, which has no position, so it gets no office rather than a wrong one.
  const unknownPlaces = input.operatingLocations.split(';').map((s) => clean(s.split(',')[0] ?? ''))
    .filter((n) => n.length >= 3 && !NOT_A_CITY_NAME.test(n) && !PROVINCE.test(lookupKey(n)) && ctx.cities.choose(n) === null)
    .map((n) => ` ${lookupKey(n)} `);

  const offices: Office[] = [];
  const addressCities = new Set<string>();
  const locatedCities = new Set<string>();
  for (const part of parts) {
    const named = officeCity(ctx, part);
    if (named === null && unknownPlaces.some((p) => tokenText(part).includes(p))) {
      stats.unknownPlace++;
      continue;
    }
    const city = named ?? operatingCityNamed(ctx, part, opCities) ?? (opCities.length === 1 ? opCities[0] : null) ?? defaultCity;
    if (city) addressCities.add(city);
    if (city && isDetailedAddress(part)) locatedCities.add(city);

    // A well-known place named in the address is the most reliable position available. The office's
    // own lookup refines it to street level only on the same terms as any other lookup: the result is a
    // building or a road whose own name the address contains, close to the place. A shop, a park or a
    // market that merely lies nearby says nothing about where this office is.
    const place = city ? ctx.places.find(geocodeText(part), city) : null;
    const point = place ? placePoint(place, ctx.cache, ctx.cities) : null;
    if (place && point && city) {
      const entry = isDetailedAddress(part) ? ctx.cache.entries[OFFICE_KEY(part)] : undefined;
      if (isDetailedAddress(part)) stats.detailedAddresses++;
      if (isDetailedAddress(part) && entry === undefined) stats.uncached++;
      stats.placedByKnownPlace++;
      if (isHit(entry) && streetName(entry, part, [place.label, ...place.match.map((m) => m.join(' '))], ctx.cityNames) && haversineKm(entry.lat, entry.lon, point.lat, point.lon) <= STREET_AGREEMENT_KM) {
        stats.streetConfirmedByPlace++;
        offices.push({ city, area: place.id, lat: round5(entry.lat), lon: round5(entry.lon), precision: 'street', address: part });
      } else {
        offices.push({ city, area: place.id, lat: round5(point.lat), lon: round5(point.lon), precision: 'area', address: part });
      }
      continue;
    }

    if (!isDetailedAddress(part)) {
      if (city) offices.push(cityOffice(ctx, city, null));
      continue;
    }
    stats.detailedAddresses++;
    const entry = ctx.cache.entries[OFFICE_KEY(part)];
    if (entry === undefined) stats.uncached++;
    if (isHit(entry) && insidePakistan(entry.lat, entry.lon)) {
      const hitCity = city ?? ctx.cities.choose(entry.place ?? '');
      const near = hitCity ? haversineKm(entry.lat, entry.lon, ctx.cities.centroid(hitCity).lat, ctx.cities.centroid(hitCity).lon) <= MAX_KM_FROM_CITY : true;
      if (precisionOf(entry) === 'city') stats.cityLevelOnlyResult++;
      else if (!near) stats.rejectedFar++;
      else if (hitCity) {
        const office = placedByLookup(entry, part, hitCity, ctx);
        if (office) {
          stats.geocoded++;
          offices.push(office);
          continue;
        }
        stats.notInAddress++;
      }
    }
    if (city) offices.push(cityOffice(ctx, city, part));
  }

  // Cities the company operates in that no address covers still get a city-level office, unless street or
  // area addresses in cities the operating locations leave out account for all of them. The source names each
  // office's city in both fields, and where they disagree the address, copied from the company's page, is the
  // one to trust: "Chandni Chowk, Rawalpindi" listed with Islamabad as its operating location is one office,
  // in Rawalpindi. An address that names only cities ("Hyderabad/Karachi, Sindh") locates nothing, so it
  // stands in for no other city.
  const uncovered = opCities.filter((c) => !addressCities.has(c) && !abroadCities.has(c));
  const unlisted = [...locatedCities].filter((c) => !opCities.includes(c));
  stats.operatingCityReplaced += uncovered.length <= unlisted.length ? uncovered.length : 0;
  if (uncovered.length > unlisted.length) for (const city of uncovered) offices.push(cityOffice(ctx, city, null));
  if (offices.length === 0 && defaultCity) offices.push(cityOffice(ctx, defaultCity, null));
  if (offices.length === 0) stats.unlocatedCompanies++;

  // Drop a bare city marker when the same city already has a more specific office, then dedupe.
  const specific = new Set(offices.filter((o) => o.precision !== 'city' || o.address).map((o) => o.city));
  const seen = new Set<string>();
  return offices
    .filter((o) => !(o.precision === 'city' && !o.address && specific.has(o.city)))
    .filter((o) => {
      const key = `${o.city}|${o.area}|${o.precision}|${o.address}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) =>
      PRECISION_RANK[a.precision] - PRECISION_RANK[b.precision] ||
      compareAscii(a.city, b.city) ||
      compareAscii(a.area ?? '', b.area ?? '') ||
      compareAscii(a.address ?? '', b.address ?? ''),
    );
}

export function loadCache(path: string): GeoCache {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return { version: 1, entries: {} };
  }
}

// One entry per line, keys sorted, so the committed cache diffs cleanly.
export function serializeCache(cache: GeoCache): string {
  const keys = Object.keys(cache.entries).sort(compareAscii);
  const lines = keys.map((k) => `${JSON.stringify(k)}:${JSON.stringify(cache.entries[k])}`);
  return `{"version":1,"entries":{\n${lines.join(',\n')}\n}}\n`;
}
