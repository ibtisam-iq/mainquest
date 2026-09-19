import meta from '../data/meta.json';
import { companies, countryConstellation, hubs } from '../lib/server-data.ts';
import { hubTitle } from '../lib/hub-label.ts';
import { OG_SIZE, OG_TYPE, shareImage } from '../lib/og.tsx';

// Prerendered default OpenGraph image displaying national aggregate metrics and geo constellation.
export const alt = 'mainquest: IT companies in Pakistan, city by city';
export const size = OG_SIZE;
export const contentType = OG_TYPE;

export default function OpenGraphImage() {
  const cities = hubs().filter((h) => h.count > 0 && h.cities.length > 0).sort((a, b) => b.count - a.count);
  return shareImage({
    lines: [`${meta.recordCount.toLocaleString('en')} IT companies`, 'in Pakistan,', 'city by city.'],
    figures: cities.map((h) => ({ label: hubTitle(h.label), value: h.count.toLocaleString('en') })),
    map: countryConstellation(companies(), 520, 440),
  });
}
