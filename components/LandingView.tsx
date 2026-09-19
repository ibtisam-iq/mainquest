import Link from 'next/link';
import type { Landing } from '../lib/landing.ts';
import { landingMap, landings } from '../lib/landing.ts';
import { areas, cities, hubs, industries, origins, tags, topCounts } from '../lib/server-data.ts';
import { hubTitle } from '../lib/hub-label.ts';
import { breadcrumbData, collectionData } from '../lib/seo.ts';
import { CompanyTable } from './CompanyTable.tsx';
import { FactCard } from './FactCard.tsx';
import { DotMap } from './DotMap.tsx';
import { Icon } from './Icon.tsx';
import { JsonLd } from './JsonLd.tsx';

const SHOWN = 100;
const fmt = (n: number) => n.toLocaleString('en');

// One landing page: a hub, a city, an area or an industry. Real HTML that search engines read, with the
// busiest areas, industries and specialties, and the most followed companies; the directory holds the rest.
export function LandingView({ page }: { page: Landing }) {
  const { kind, rows } = page;
  const all = landings();
  const pathOf = (k: Landing['kind'], id: string) => all.find((p) => p.kind === k && p.id === id)?.path;
  const ind = new Map(industries().map((i) => [i.id, i.label]));
  const tag = new Map(tags().map((t) => [t.id, t.label]));
  const area = new Map(areas().map((a) => [a.id, a.label]));
  const cityLabel = new Map(cities().map((c) => [c.id, c.label]));
  const hubList = hubs();
  const { homeAdjective } = origins();
  const own = page.cities;
  const inPlace = (city: string) => own.length === 0 || own.includes(city);
  const withParam = (key: string, value: string) => `${page.browse}&${key}=${encodeURIComponent(value)}`;

  const topAreas = kind === 'industry' || kind === 'area' ? [] : topCounts(rows.flatMap((r) => [...new Set(r.offices.flatMap((o) => (o.area && own.includes(o.city) ? [o.area] : [])))]), 10);
  const topIndustries = kind === 'industry' ? [] : topCounts(rows.map((r) => r.industry), 10);
  const topTags = topCounts(rows.flatMap((r) => r.tags), 10);
  // The cities inside a hub that stands for more than one, or for the cities no named hub covers.
  const hubCityPages = kind === 'hub' && own.length !== 1
    ? topCounts(rows.flatMap((r) => [...new Set(r.offices.map((o) => o.city))]).filter((c) => (own.length ? own.includes(c) : !hubList.some((h) => h.cities.includes(c)))), 10)
    : [];
  const otherAreas = page.area
    ? all.filter((p) => p.kind === 'area' && p.cities[0] === own[0] && p.id !== page.area).sort((a, b) => b.rows.length - a.rows.length || a.short.localeCompare(b.short)).slice(0, 10)
    : [];
  const byHub = kind === 'industry' ? topCounts(rows.flatMap((r) => r.hubs), 5) : [];

  const placed = rows.filter((r) => r.offices.some((o) => o.precision !== 'city' && inPlace(o.city))).length;
  const atHome = rows.filter((r) => r.origin === 'local').length;
  const withWebsite = rows.filter((r) => r.website).length;
  const founded = rows.flatMap((r) => (r.founded ? [r.founded] : [])).sort((a, b) => a - b);
  const medianFounded = founded.length ? founded[Math.floor(founded.length / 2)] : null;
  const officeCities = new Set(rows.flatMap((r) => r.offices.map((o) => o.city))).size;
  const stats: { value: string; label: string }[] =
    kind === 'industry'
      ? [
          { value: fmt(officeCities), label: officeCities === 1 ? 'city' : 'cities' },
          { value: fmt(rows.length - atHome), label: 'registered or based abroad' },
          ...(medianFounded ? [{ value: String(medianFounded), label: 'median founding year' }] : []),
        ]
      : kind === 'area'
        ? [
            { value: fmt(atHome), label: `${homeAdjective} companies` },
            { value: fmt(withWebsite), label: 'list a website' },
            ...(medianFounded ? [{ value: String(medianFounded), label: 'median founding year' }] : []),
          ]
        : [
            { value: fmt(placed), label: 'placed at street or area level' },
            { value: fmt(atHome), label: `${homeAdjective} companies` },
            { value: fmt(withWebsite), label: 'list a website' },
          ];

  const map = landingMap(page, 560, kind === 'industry' ? 420 : 400);
  const mapCaption =
    kind === 'industry' ? 'Each dot is a city, sized by the offices there'
      : kind === 'area' ? `Offices in ${cityLabel.get(own[0]) ?? own[0]} placed at street or area level, with ${page.short} marked`
        : 'Each dot is an office placed at street or area level';

  const lede =
    kind === 'industry' ? `${fmt(rows.length)} ${rows.length === 1 ? 'company lists' : 'companies list'} ${page.name} as their industry.`
      : kind === 'hub' ? `${fmt(rows.length)} ${rows.length === 1 ? 'company' : 'companies'} with an office or headquarters in ${page.name}.`
        : kind === 'area' ? `${fmt(rows.length)} ${rows.length === 1 ? 'company' : 'companies'} with an office in ${page.name}, placed to the street or area.`
          : `${fmt(rows.length)} ${rows.length === 1 ? 'company' : 'companies'} with an office in ${page.name}.`;

  const sorted = [...rows].sort((a, b) => (b.followers ?? -1) - (a.followers ?? -1) || a.name.localeCompare(b.name, 'en'));
  const hubLabel = (id: string) => hubTitle(hubList.find((h) => h.id === id)?.label ?? id);

  return (
    <main id="main" className="landing">
      <JsonLd data={breadcrumbData(page.crumbs, { label: page.short, path: page.path })} />
      <JsonLd data={collectionData({ name: page.heading, description: page.description, path: page.path, count: rows.length })} />
      <section className="landing-hero">
        <div className="container landing-hero__inner">
          <div>
            <nav className="crumbs" aria-label="Breadcrumb">
              {page.crumbs.map((c) => <span key={c.href} className="crumbs__step"><Link href={c.href}>{c.label}</Link><Icon name="chevronRight" size={14} /></span>)}
              <span aria-current="page">{page.short}</span>
            </nav>
            <h1>{page.heading}</h1>
            <p className="landing-hero__lede">{lede} The full list, with search, filters and distance, is in the directory.</p>
            <div className="landing-hero__actions">
              <Link className="btn btn--primary btn--lg" href={page.browse}>{page.browseLabel}<Icon name="arrowRight" size={16} /></Link>
              <Link className="btn btn--lg" href={`${page.browse}&view=map`}><Icon name="map" size={16} />Map view</Link>
            </div>
            <ul className="stats">
              {stats.map((s) => <li key={s.label}><strong>{s.value}</strong><span>{s.label}</span></li>)}
            </ul>
          </div>
          {map.dots.length > 0 && (
            <figure className="landing-map">
              <DotMap map={map} title={kind === 'industry' ? `Where ${page.name} companies have offices` : `Where the companies in ${page.name} are placed`} />
              <figcaption>{mapCaption}</figcaption>
            </figure>
          )}
        </div>
      </section>
      <div className="container landing-body">
        <div className="fact-grid">
          <FactCard title="Cities" items={hubCityPages.flatMap(([id, n]) => { const href = pathOf('city', id); return href ? [{ href, label: cityLabel.get(id) ?? id, count: n }] : []; })} />
          <FactCard title="Busiest areas" items={topAreas.map(([id, n]) => ({ href: pathOf('area', id) ?? withParam('area', id), label: area.get(id) ?? id, count: n }))} />
          <FactCard title="By city" items={byHub.map(([id, n]) => ({ href: withParam('city', id), label: hubLabel(id), count: n }))} />
          <FactCard title="Industries" items={topIndustries.map(([id, n]) => ({ href: withParam('industry', id), label: ind.get(id) ?? id, count: n }))} />
          <FactCard title="Common specialties" items={topTags.map(([id, n]) => ({ href: withParam('specialty', id), label: tag.get(id) ?? id, count: n }))} />
          <FactCard title={`Other areas in ${cityLabel.get(own[0]) ?? ''}`} items={otherAreas.map((p) => ({ href: p.path, label: p.short, count: p.rows.length }))} />
        </div>
        <div className="section-head">
          <h2>Most followed</h2>
          <p>{Math.min(SHOWN, rows.length)} of {fmt(rows.length)}</p>
        </div>
        <CompanyTable rows={sorted.slice(0, SHOWN)} industryLabel={(id) => ind.get(id) ?? id} areaLabel={(id) => area.get(id) ?? id} preferCities={own} />
        {rows.length > SHOWN && <p className="more"><Link className="btn btn--lg" href={page.browse}>See all {fmt(rows.length)} in the directory<Icon name="arrowRight" size={16} /></Link></p>}
      </div>
    </main>
  );
}
