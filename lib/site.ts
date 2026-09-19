// The site's own address and name, and the rules every page's title and description follow (decision 28).
// Pages, the sitemap, robots.txt, share cards and structured data all read the address from here.

export const SITE_URL = 'https://mainquest.ibtisam-iq.com';
export const SITE_NAME = 'mainquest';

// Search results show about 60 characters of a title before cutting it short.
export const TITLE_MAX = 60;
// Search results show about 160 characters of a description; a chat preview shows the first 80 or so,
// so the facts that matter most come first.
export const DESCRIPTION_MAX = 160;
export const DESCRIPTION_MIN = 70;

// A page listing fewer companies than this is kept out of search results and the sitemap: too thin to be
// worth a result of its own, though still a page for anyone who follows a link to it.
export const MIN_INDEXED = 5;

export function absoluteUrl(path: string): string {
  return path === '/' ? `${SITE_URL}/` : `${SITE_URL}${path}`;
}

// The first title that fits, trying each with the site's name after it and then without. The longest,
// most descriptive wording is listed first; the last one is used even if nothing fits.
export function fitTitle(wordings: readonly string[]): string {
  for (const w of wordings) {
    if (`${w} | ${SITE_NAME}`.length <= TITLE_MAX) return `${w} | ${SITE_NAME}`;
    if (w.length <= TITLE_MAX) return w;
  }
  return wordings[wordings.length - 1];
}

// "Karachi, Lahore and Faisalabad".
export function listWords(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// Structured data for a script tag. A "<" inside a company name would otherwise be able to close the tag.
export function jsonLdText(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
