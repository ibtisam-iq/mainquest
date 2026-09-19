'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// City links in the header, marked when their page is the one open.
export function SiteNav({ links }: { links: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav className="site-nav" aria-label="Cities">
      {links.map((l) => (
        <Link key={l.href} href={l.href} className="site-nav__link" aria-current={path === l.href ? 'page' : undefined}>{l.label}</Link>
      ))}
    </nav>
  );
}
