import type { MetadataRoute } from 'next';
import { landings } from '../lib/landing.ts';
import { latestUpdate } from '../lib/server-data.ts';
import { absoluteUrl } from '../lib/site.ts';

// Sitemap index generation: covers the directory, directory index, and all eligible landing pages.
export default function sitemap(): MetadataRoute.Sitemap {
  const latest = latestUpdate();
  return [
    { url: absoluteUrl('/'), lastModified: latest },
    { url: absoluteUrl('/companies'), lastModified: latest },
    ...landings().filter((p) => p.indexed).map((p) => ({ url: absoluteUrl(p.path), lastModified: p.updated })),
  ];
}
