// The head of every page: title, description, canonical address, and the tags chat apps and social
// sites read to draw a link preview (decision 28). Built in one place so no page falls back to another
// page's preview: a page that sets only its title would otherwise share the home page's preview text.
import type { Metadata } from 'next';
import type { Crumb, Landing } from './landing.ts';
import { SITE_NAME, SITE_URL, absoluteUrl } from './site.ts';

export function pageMetadata({ title, description, path, indexed = true }: { title: string; description: string; path: string; indexed?: boolean }): Metadata {
  const url = absoluteUrl(path);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    // A thin page is still followed to the pages it links to.
    robots: indexed ? undefined : { index: false, follow: true },
    openGraph: { type: 'website', siteName: SITE_NAME, locale: 'en_GB', title, description, url },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export const landingMetadata = (p: Landing): Metadata => pageMetadata({ title: p.title, description: p.description, path: p.path, indexed: p.indexed });

// Structured data: facts about a page in a form search engines read directly, in schema.org terms.
const WEBSITE_ID = `${SITE_URL}/#website`;

export function websiteData(description: string) {
  return { '@context': 'https://schema.org', '@type': 'WebSite', '@id': WEBSITE_ID, name: SITE_NAME, url: absoluteUrl('/'), description, inLanguage: 'en' };
}

// The directory described as a dataset, which dataset search engines list.
export function datasetData({ description, updated, places, homeName }: { description: string; updated: string; places: string[]; homeName: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: `IT companies in ${homeName}`,
    description,
    url: absoluteUrl('/'),
    isPartOf: { '@id': WEBSITE_ID },
    keywords: ['IT companies', 'software houses', 'software companies', homeName, ...places],
    spatialCoverage: { '@type': 'Place', name: homeName },
    dateModified: updated,
    isAccessibleForFree: true,
    variableMeasured: ['company name', 'industry', 'specialties', 'city', 'area', 'office address', 'website', 'founding year'],
  };
}

export function breadcrumbData(crumbs: readonly Crumb[], current: { label: string; path: string }) {
  const items = [...crumbs, { href: current.path, label: current.label }];
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.label, item: absoluteUrl(c.href) })),
  };
}

export function collectionData({ name, description, path, count }: { name: string; description: string; path: string; count?: number }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name,
    description,
    url: absoluteUrl(path),
    isPartOf: { '@id': WEBSITE_ID },
    inLanguage: 'en',
    ...(count === undefined ? {} : { mainEntity: { '@type': 'ItemList', numberOfItems: count } }),
  };
}
