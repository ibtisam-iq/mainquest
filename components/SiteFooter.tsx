import Link from 'next/link';
import { companies, hubs, industries, latestUpdate, origins } from '../lib/server-data.ts';
import { formatDate } from '../lib/format.ts';
import { hubTitle } from '../lib/hub-label.ts';
import { LogoMark } from './Logo.tsx';
import { ThemeSwitch } from './ThemeToggle.tsx';

const INDUSTRIES_SHOWN = 6;

// The end of every page. Every figure and name here comes from the data files at build time.
export function SiteFooter() {
  const total = companies().length;
  const latest = latestUpdate();
  const cityLinks = hubs().filter((h) => h.count > 0).sort((a, b) => b.count - a.count);
  const topIndustries = industries().sort((a, b) => b.count - a.count).slice(0, INDUSTRIES_SHOWN);
  const fmt = (n: number) => n.toLocaleString('en');
  // The companies that are not simply at home, by where they are run from (decision 27).
  const abroadViews = origins().values.filter((v) => v.id === 'registered-abroad' || v.id === 'international');
  return (
    <footer className="site-footer">
      <div className="container site-footer__top">
        <div className="site-footer__about">
          <Link href="/" className="brand" aria-label="mainquest, all companies">
            <LogoMark />
            <span className="wordmark">main<span>quest</span></span>
          </Link>
          <p>{fmt(total)} IT companies in Pakistan. Each entry links to the company&apos;s own pages for anything that changes.</p>
          {latest && <p className="site-footer__date"><span className="live-dot" aria-hidden="true" />Data last changed {formatDate(latest)}</p>}
        </div>
        <nav aria-label="Companies by city" className="site-footer__col">
          <h2>Cities</h2>
          <ul>
            {cityLinks.map((h) => (
              <li key={h.id}><Link href={`/companies/${h.id}`} title={h.label}>{hubTitle(h.label)}</Link> <span>{fmt(h.count)}</span></li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Companies by industry" className="site-footer__col site-footer__industries">
          <h2>Industries</h2>
          <ul>
            {topIndustries.map((i) => (
              <li key={i.id}><Link href={`/industry/${i.id}`} title={i.label}>{i.label}</Link> <span>{fmt(i.count)}</span></li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Views" className="site-footer__col">
          <h2>Views</h2>
          <ul>
            <li><Link href="/">All companies</Link></li>
            <li><Link href="/companies">Every city, area and industry</Link></li>
            <li><Link href="/?view=map">Map</Link></li>
            <li><Link href="/?website=1">With a website</Link></li>
            {abroadViews.map((v) => <li key={v.id}><Link href={`/?origin=${v.id}`}>{v.label}</Link></li>)}
          </ul>
        </nav>
      </div>
      <div className="site-footer__bottom">
        <div className="container">
          <p>Map data © <a href="https://www.openstreetmap.org/copyright" rel="noopener noreferrer">OpenStreetMap</a> contributors, ODbL. Map tiles by <a href="https://openfreemap.org" rel="noopener noreferrer">OpenFreeMap</a> and <a href="https://www.openmaptiles.org/" rel="noopener noreferrer">OpenMapTiles</a>.</p>
          <div className="site-footer__end">
            <p><a href="https://github.com/ibtisam-iq/mainquest" rel="noopener noreferrer">Code on GitHub</a>, MIT licence</p>
            <ThemeSwitch />
          </div>
        </div>
      </div>
    </footer>
  );
}
