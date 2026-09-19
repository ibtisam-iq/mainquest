import { landingAt, landingsOf } from '../../../lib/landing.ts';
import { OG_ALT, OG_SIZE, OG_TYPE, landingShare } from '../../../lib/og.tsx';

// Prerendered OpenGraph share image for industry landings.
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = OG_TYPE;

export function generateStaticParams() {
  return landingsOf('industry').map((p) => ({ slug: p.id }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const page = landingAt(`/industry/${(await params).slug}`);
  if (!page) throw new Error('No landing page for this address.');
  return landingShare(page);
}
