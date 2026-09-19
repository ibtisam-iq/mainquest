import meta from '../../data/meta.json';
import { landings } from '../../lib/landing.ts';
import { companies, countryConstellation } from '../../lib/server-data.ts';
import { OG_SIZE, OG_TYPE, shareImage } from '../../lib/og.tsx';

// The share picture for the index of cities, areas and industries.
export const alt = 'The number of IT companies in Pakistan, and how many cities, areas and industries have a page, with a dot map of their offices';
export const size = OG_SIZE;
export const contentType = OG_TYPE;

export default function Image() {
  const count = (kind: string) => landings().filter((p) => p.kind === kind).length;
  return shareImage({
    lines: [`${meta.recordCount.toLocaleString('en')} IT companies`, 'by city, area', 'and industry.'],
    figures: [
      { label: 'Cities and hubs', value: String(count('hub') + count('city')) },
      { label: 'Areas', value: String(count('area')) },
      { label: 'Industries', value: String(count('industry')) },
    ],
    map: countryConstellation(companies(), 520, 440),
  });
}
