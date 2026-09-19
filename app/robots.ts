import type { MetadataRoute } from 'next';
import { absoluteUrl } from '../lib/site.ts';

// Crawler directives: allows static canonical pages while disallowing query-parameterized
// search URLs to prevent crawler traps.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', allow: '/', disallow: '/?' }, sitemap: absoluteUrl('/sitemap.xml') };
}
