import { jsonLdText } from '../lib/site.ts';

// Structured data for search engines, in the page's HTML so it is read without running any script.
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(data) }} />;
}
