import type { Metadata } from 'next';
import Link from 'next/link';
import { hubs } from '../lib/server-data.ts';
import { hubTitle } from '../lib/hub-label.ts';
import { Icon } from '../components/Icon.tsx';

export const metadata: Metadata = { title: 'Page not found' };

// Any address with no page: a way back to the directory and to each city.
export default function NotFound() {
  const cities = hubs().filter((h) => h.count > 0).sort((a, b) => b.count - a.count);
  return (
    <main id="main" className="not-found">
      <div className="container not-found__inner">
        <p className="not-found__code" aria-hidden="true">404</p>
        <h1>No page at this address</h1>
        <p className="not-found__lede">The address may be mistyped, or the page may have moved. Every company is in the directory.</p>
        <div className="landing-hero__actions">
          <Link className="btn btn--primary btn--lg" href="/"><Icon name="search" size={16} />Search the directory</Link>
        </div>
        <ul className="not-found__cities" aria-label="Cities">
          {cities.map((h) => (
            <li key={h.id}><Link href={`/companies/${h.id}`}>{hubTitle(h.label)}<span>{h.count.toLocaleString('en')}</span></Link></li>
          ))}
        </ul>
      </div>
    </main>
  );
}
