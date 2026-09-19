import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Bricolage_Grotesque, Geist, Geist_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { SiteFooter } from '../components/SiteFooter.tsx';
import { SiteNav } from '../components/SiteNav.tsx';
import { SiteMenu } from '../components/SiteMenu.tsx';
import { ThemeToggle } from '../components/ThemeToggle.tsx';
import { LogoMark } from '../components/Logo.tsx';
import { Icon } from '../components/Icon.tsx';
import { hubs, industries } from '../lib/server-data.ts';
import { hubTitle } from '../lib/hub-label.ts';
import { THEME_SCRIPT } from '../lib/theme.ts';
import { SITE_NAME, SITE_URL } from '../lib/site.ts';
import './globals.css';

// Self-hosted fonts loaded via next/font.
const display = Bricolage_Grotesque({ subsets: ['latin'], axes: ['opsz'], variable: '--font-bricolage', display: 'swap' });
const body = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' });
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap' });

const DESCRIPTION = 'A directory of IT companies and software houses in Pakistan, filterable by city, area, industry and specialty, with links to each company.';

// Search console verification tokens from environment.
const verification: Metadata['verification'] = {
  ...(process.env.GOOGLE_SITE_VERIFICATION ? { google: process.env.GOOGLE_SITE_VERIFICATION } : {}),
  ...(process.env.BING_SITE_VERIFICATION ? { other: { 'msvalidate.01': process.env.BING_SITE_VERIFICATION } } : {}),
};

// Default fallback metadata; route pages override with structured metadata via lib/seo.ts.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `IT companies in Pakistan | ${SITE_NAME}`, template: `%s | ${SITE_NAME}` },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: { type: 'website', siteName: SITE_NAME, title: `IT companies in Pakistan | ${SITE_NAME}`, description: DESCRIPTION, locale: 'en_GB' },
  twitter: { card: 'summary_large_image' },
  verification,
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f9f8' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // Top hub navigation links ordered by company count.
  const allHubs = hubs().filter((h) => h.count > 0).sort((a, b) => b.count - a.count);
  const cityLinks = allHubs.filter((h) => h.cities.length > 0).map((h) => ({ href: `/companies/${h.id}`, label: hubTitle(h.label) }));
  const menuCities = allHubs.map((h) => ({ href: `/companies/${h.id}`, label: hubTitle(h.label), count: h.count }));
  const menuIndustries = industries().sort((a, b) => b.count - a.count).slice(0, 6).map((i) => ({ href: `/industry/${i.id}`, label: i.label, count: i.count }));
  return (
    // Pre-hydration theme injection avoids flash of unstyled theme (FOUC).
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`} data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <a className="skip-link" href="#main">Skip to the directory</a>
        <header className="site-header">
          <div className="site-header__inner container">
            <Link href="/" className="brand" aria-label="mainquest, all companies">
              <LogoMark />
              <span className="wordmark">main<span>quest</span></span>
            </Link>
            <SiteNav links={cityLinks} />
            <div className="site-header__tools">
              <ThemeToggle />
              <a className="icon-link site-header__code" href="https://github.com/ibtisam-iq/mainquest" rel="noopener noreferrer" aria-label="Code on GitHub">
                <Icon name="github" size={18} />
              </a>
              <SiteMenu cities={menuCities} industries={menuIndustries} />
            </div>
          </div>
        </header>
        {children}
        <SiteFooter />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
