import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { landingAt, landingsOf } from '../../../../lib/landing.ts';
import { landingMetadata } from '../../../../lib/seo.ts';
import { LandingView } from '../../../../components/LandingView.tsx';

// Granular sub-area landing route (e.g. /companies/islamabad/blue-area).
export const dynamicParams = false;
export function generateStaticParams() {
  return landingsOf('area').map((p) => {
    const [, , place, area] = p.path.split('/');
    return { place, area };
  });
}

type Params = Promise<{ place: string; area: string }>;
const pathOf = async (params: Params) => {
  const { place, area } = await params;
  return `/companies/${place}/${area}`;
};

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const page = landingAt(await pathOf(params));
  return page ? landingMetadata(page) : {};
}

export default async function AreaPage({ params }: { params: Params }) {
  const page = landingAt(await pathOf(params));
  if (!page) notFound();
  return <LandingView page={page} />;
}
