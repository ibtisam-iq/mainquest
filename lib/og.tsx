// The picture a chat app or social site shows when a page's link is shared (decision 28): the logo, the
// headline with its count, up to four figures, and the page's own dot map, on the dark theme's colours.
// Built at build time from the same data as the page, 1200 by 630 pixels, the size every preview uses.
import { ImageResponse } from 'next/og';
import type { Constellation } from './constellation.ts';
import { landingHighlights, landingMap, type Landing } from './landing.ts';
import { origins } from './server-data.ts';

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_TYPE = 'image/png';
// One description serves every landing page's picture: Next.js builds a picture ahead of time only when
// its description is fixed, and a picture drawn on request would need the data files on the server.
export const OG_ALT = 'The number of IT companies on the page, its largest groups, and a dot map of where the companies have offices';

const INK = '#fafafa';
const MUTED = '#8a8a8a';
const GREEN = '#1fdc82';
const BG = '#0a0a0a';

function mapSvg(map: Constellation): string {
  const dots = map.dots.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${GREEN}" fill-opacity="0.7"/>`).join('');
  const marks = map.marks.map(([x, y]) => `<path d="M${x - 6} ${y}h12M${x} ${y - 6}v12" stroke="${INK}" stroke-opacity="0.6" stroke-width="1.6"/>`).join('');
  const escape = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const labels = map.labels.map(([x, y, text, anchor]) => `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="sans-serif" font-size="17" font-weight="600" fill="${INK}" stroke="${BG}" stroke-width="4" paint-order="stroke">${escape(text)}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${map.width} ${map.height}">${dots}${marks}${labels}</svg>`;
}

export interface ShareCard {
  // A short line above the headline, such as the page's parent place.
  kicker?: string;
  // The headline, one entry per line; the last line is drawn in green.
  lines: string[];
  figures: { label: string; value: string }[];
  map: Constellation | null;
}

export function shareImage({ kicker, lines, figures, map }: ShareCard): ImageResponse {
  const longest = Math.max(...lines.map((l) => l.length));
  // The headline column is about 620 pixels wide; long place names get a smaller size so each line fits.
  const fontSize = longest <= 18 ? 60 : longest <= 24 ? 50 : longest <= 30 ? 42 : 36;
  const withMap = map !== null && map.dots.length > 0;
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: BG, color: INK, padding: 64, fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: '#1b3a30', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 20, height: 20, borderRadius: 10, background: '#7fd1a6' }} />
            </div>
            <div style={{ fontSize: 38, fontWeight: 700, display: 'flex' }}>main<span style={{ color: GREEN }}>quest</span></div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {kicker && <div style={{ display: 'flex', fontSize: 24, color: MUTED, marginBottom: 14 }}>{kicker}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', fontSize, lineHeight: 1.08, letterSpacing: -1.5 }}>
              {lines.map((l, i) => <div key={i} style={{ display: 'flex', color: i === lines.length - 1 ? GREEN : INK }}>{l}</div>)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 14 }}>
            {figures.map((f) => (
              <div key={f.label} style={{ display: 'flex', flexDirection: 'column', padding: '12px 18px', borderRadius: 16, border: '1px solid #262626', background: '#111111', maxWidth: 230 }}>
                <span style={{ fontSize: 22, fontWeight: 700 }}>{f.label}</span>
                <span style={{ fontSize: 18, color: MUTED }}>{f.value}</span>
              </div>
            ))}
          </div>
        </div>
        {withMap && <img width={420} height={Math.round((420 * map.height) / map.width)} alt="" src={`data:image/svg+xml;base64,${Buffer.from(mapSvg(map)).toString('base64')}`} style={{ alignSelf: 'center', marginLeft: 24 }} />}
      </div>
    ),
    OG_SIZE,
  );
}

// A landing page's picture: its count and place (or industry), its largest groups, and its map.
export function landingShare(page: Landing): ImageResponse {
  const n = page.rows.length;
  const count = n.toLocaleString('en');
  const what = n === 1 ? 'IT company' : 'IT companies';
  const parents = page.crumbs.slice(1).map((c) => c.label).reverse();
  const card: ShareCard =
    page.kind === 'industry'
      ? { kicker: `${origins().homeName}, by industry`, lines: [`${count} ${n === 1 ? 'company' : 'companies'} in`, page.name], figures: [], map: null }
      : page.kind === 'area'
        ? { kicker: parents.join(', '), lines: [`${count} ${what}`, `in ${page.short}`], figures: [], map: null }
        : { kicker: parents.join(', ') || undefined, lines: [`${count} ${what}`, `in ${page.name}`], figures: [], map: null };
  card.figures = landingHighlights(page).map((h) => ({ label: h.label, value: `${h.count.toLocaleString('en')} ${h.count === 1 ? 'company' : 'companies'}` }));
  card.map = landingMap(page, 520, 440);
  return shareImage(card);
}
