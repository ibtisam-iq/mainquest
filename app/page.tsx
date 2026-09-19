import { Suspense } from 'react';
import type { Metadata } from 'next';
import meta from '../data/meta.json';
import Directory from '../components/Directory.tsx';
import { DirectoryShell } from '../components/DirectoryShell.tsx';
import type { CityTileData } from '../components/CityTiles.tsx';
import { areas, cities, companies, countryConstellation, hubConstellation, hubs, latestUpdate, origins, topCounts } from '../lib/server-data.ts';
import { DotMap } from '../components/DotMap.tsx';
import { hubTitle } from '../lib/hub-label.ts';
import { formatDate } from '../lib/format.ts';
import { fitTitle, listWords } from '../lib/site.ts';
import { datasetData, pageMetadata, websiteData } from '../lib/seo.ts';
import { JsonLd } from '../components/JsonLd.tsx';

// Top cities by office density for metadata descriptions.
const topCities = () => cities().sort((a, b) => b.count - a.count).slice(0, 5).map((c) => c.label);

function describe() {
  const { homeName } = origins();
  return {
    title: fitTitle([`IT companies and software houses in ${homeName}`, `IT companies in ${homeName}`]),
    description: `${meta.recordCount.toLocaleString('en')} IT companies and software houses in ${homeName}, searchable by name, specialty and area, across ${listWords(topCities())}.`,
  };
}

export function generateMetadata(): Metadata {
  return pageMetadata({ ...describe(), path: '/' });
}

// Generates hub overview cards with embedded constellations and top sub-areas.
function tiles(): CityTileData[] {
  const areaLabel = new Map(areas().map((a) => [a.id, a.label]));
  return hubs()
    .filter((h) => h.count > 0)
    .sort((a, b) => b.count - a.count)
    .map((h) => {
      const own = h.cities.length > 0 ? h.cities : undefined;
      const rows = companies().filter((r) => r.hubs.includes(h.id));
      const title = hubTitle(h.label);
      let note: string;
      if (!own) note = `Across ${new Set(rows.flatMap((r) => r.offices.map((o) => o.city))).size} cities`;
      else if (title !== h.place) note = h.place;
      else {
        const [top] = topCounts(rows.flatMap((r) => [...new Set(r.offices.flatMap((o) => (o.area && own.includes(o.city) ? [o.area] : [])))]), 1);
        note = top ? `Most in ${areaLabel.get(top[0]) ?? top[0]}` : h.place;
      }
      return { id: h.id, title, note, count: h.count, cities: h.cities, map: hubConstellation(h.id, 250, 100, false, { minRadius: 1.6, growth: 0.8, maxRadius: 6, pad: 8 }) };
    });
}

export default function Home() {
  const count = meta.recordCount.toLocaleString('en');
  const cityTiles = tiles();
  const country = countryConstellation(companies(), 520, 400);
  const placed = companies().filter((r) => r.offices.some((o) => o.precision !== 'city')).length;
  const { description } = describe();
  return (
    <main id="main">
      <JsonLd data={websiteData(description)} />
      <JsonLd data={datasetData({ description, updated: latestUpdate(), places: topCities(), homeName: origins().homeName })} />
      <section className="hero">
        <div className="container hero__inner">
          <div className="hero__text">
            <p className="hero__eyebrow"><span className="live-dot" aria-hidden="true" />Data last changed {formatDate(latestUpdate())}</p>
            <h1 className="hero__title">{count} IT companies in Pakistan, <em>city by city.</em></h1>
            <p className="hero__lede">Searchable by name, specialty and area, filtered by city, industry and founding year, and ranked by distance from any point. Every entry links to the company&apos;s own pages.</p>
          </div>
          <figure className="hero-map">
            <DotMap map={country} title="Where the companies have offices, city by city" />
            <figcaption><span>Offices by city</span><span>{placed.toLocaleString('en')} placed to the street or area</span></figcaption>
          </figure>
        </div>
      </section>
      <Suspense fallback={<DirectoryShell total={meta.recordCount} tiles={cityTiles} />}>
        <Directory total={meta.recordCount} tiles={cityTiles} />
      </Suspense>
    </main>
  );
}
