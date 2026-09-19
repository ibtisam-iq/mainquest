import type { Metadata } from 'next';
import Link from 'next/link';
import { landings, type Landing } from '../../lib/landing.ts';
import { companies, hubs, latestUpdate } from '../../lib/server-data.ts';
import { fitTitle } from '../../lib/site.ts';
import { breadcrumbData, collectionData, pageMetadata } from '../../lib/seo.ts';
import { Icon } from '../../components/Icon.tsx';
import { JsonLd } from '../../components/JsonLd.tsx';
import { formatDate } from '../../lib/format.ts';

const PATH = '/companies';
const LABEL = 'Cities, areas and industries';

function describe(): { title: string; description: string } {
  const all = landings();
  const places = all.filter((p) => p.kind === 'hub' || p.kind === 'city').length;
  const areaCount = all.filter((p) => p.kind === 'area').length;
  const industryCount = all.filter((p) => p.kind === 'industry').length;
  return {
    title: fitTitle(['IT companies in Pakistan by city, area and industry', 'By city, area and industry']),
    description: `The ${companies().length.toLocaleString('en')} IT companies in Pakistan by place and industry: ${places} cities and hubs, ${areaCount} areas and ${industryCount} industries, each with its own page.`,
  };
}

export function generateMetadata(): Metadata {
  return pageMetadata({ ...describe(), path: PATH });
}

const byCount = (a: Landing, b: Landing) => b.rows.length - a.rows.length || a.short.localeCompare(b.short, 'en');
const fmt = (n: number) => n.toLocaleString('en');

function Links({ pages, label }: { pages: Landing[]; label: string }) {
  return (
    <ul className="index-list" aria-label={label}>
      {pages.map((p) => <li key={p.path}><Link href={p.path}>{p.short}</Link><span>{fmt(p.rows.length)}</span></li>)}
    </ul>
  );
}

// Directory index providing crawlable links to all regional and vertical landing pages.
export default function IndexPage() {
  const all = landings();
  const { description } = describe();
  const hubPages = all.filter((p) => p.kind === 'hub').sort(byCount);
  const cityPages = all.filter((p) => p.kind === 'city');
  const hubList = hubs();
  const inHub = (hubId: string) => {
    const own = hubList.find((h) => h.id === hubId)?.cities ?? [];
    const named = new Set(hubList.flatMap((h) => h.cities));
    return cityPages.filter((c) => (own.length ? own.includes(c.id) : !named.has(c.id))).sort(byCount);
  };
  // Groups sub-areas under parent city, ordered by company count.
  const areaGroups = [...hubPages.filter((h) => h.cities.length === 1), ...cityPages]
    .map((place) => ({ place, areas: all.filter((p) => p.kind === 'area' && p.cities[0] === place.cities[0]).sort(byCount) }))
    .filter((g) => g.areas.length > 0)
    .sort((a, b) => byCount(a.place, b.place));
  const industryPages = all.filter((p) => p.kind === 'industry').sort(byCount);

  return (
    <main id="main" className="landing">
      <JsonLd data={breadcrumbData([{ href: '/', label: 'All companies' }], { label: LABEL, path: PATH })} />
      <JsonLd data={collectionData({ name: LABEL, description, path: PATH })} />
      <section className="landing-hero">
        <div className="container index-hero">
          <nav className="crumbs" aria-label="Breadcrumb">
            <span className="crumbs__step"><Link href="/">All companies</Link><Icon name="chevronRight" size={14} /></span>
            <span aria-current="page">{LABEL}</span>
          </nav>
          <h1>Every city, area and industry</h1>
          <p className="landing-hero__lede">Each has a page with its companies, busiest areas and common specialties. Counts are of companies with an office or headquarters there. Data last changed {formatDate(latestUpdate())}.</p>
        </div>
      </section>
      <div className="container landing-body index-body">
        <section className="index-group" aria-labelledby="index-cities">
          <h2 id="index-cities">Cities</h2>
          <div className="index-cities">
            {hubPages.filter((h) => h.cities.length > 0).map((h) => {
              const inside = inHub(h.id);
              return (
                <div key={h.path} className="index-city">
                  <h3><Link href={h.path}>{h.short}</Link><span>{fmt(h.rows.length)}</span></h3>
                  {inside.length > 0 && <Links pages={inside} label={`Cities in ${h.short}`} />}
                </div>
              );
            })}
          </div>
          {/* The catch-all hub's cities, many and small, in columns across the page. Its count is left out:
              the hub holds companies whose listing names no hub city, while each city counts every office there. */}
          {hubPages.filter((h) => h.cities.length === 0).map((h) => (
            <div key={h.path} className="index-areas index-rest">
              <h3><Link href={h.path}>{h.short}</Link></h3>
              <Links pages={inHub(h.id)} label={`Cities in ${h.short}`} />
            </div>
          ))}
        </section>
        <section className="index-group" aria-labelledby="index-areas">
          <h2 id="index-areas">Areas</h2>
          {areaGroups.map(({ place, areas }) => (
            <div key={place.path} className="index-areas">
              <h3><Link href={place.path}>{place.name}</Link></h3>
              <Links pages={areas} label={`Areas in ${place.name}`} />
            </div>
          ))}
        </section>
        <section className="index-group" aria-labelledby="index-industries">
          <h2 id="index-industries">Industries</h2>
          <Links pages={industryPages} label="Industries" />
        </section>
      </div>
    </main>
  );
}
