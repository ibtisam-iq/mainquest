import { landingAt, landingsOf } from '../../../../lib/landing.ts';
import { OG_ALT, OG_SIZE, OG_TYPE, landingShare } from '../../../../lib/og.tsx';

// Prerendered OpenGraph share image for area landings.
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = OG_TYPE;

export function generateStaticParams() {
  return landingsOf('area').map((p) => {
    const [, , place, area] = p.path.split('/');
    return { place, area };
  });
}

export default async function Image({ params }: { params: Promise<{ place: string; area: string }> }) {
  const { place, area } = await params;
  const page = landingAt(`/companies/${place}/${area}`);
  if (!page) throw new Error('No landing page for this address.');
  return landingShare(page);
}
