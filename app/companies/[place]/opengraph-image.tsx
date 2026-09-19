import { landingAt, landings } from '../../../lib/landing.ts';
import { OG_ALT, OG_SIZE, OG_TYPE, landingShare } from '../../../lib/og.tsx';

// Prerendered OpenGraph share image for hub and city landings.
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = OG_TYPE;

export function generateStaticParams() {
  return landings().filter((p) => p.kind === 'hub' || p.kind === 'city').map((p) => ({ place: p.id }));
}

export default async function Image({ params }: { params: Promise<{ place: string }> }) {
  const page = landingAt(`/companies/${(await params).place}`);
  if (!page) throw new Error('No landing page for this address.');
  return landingShare(page);
}
