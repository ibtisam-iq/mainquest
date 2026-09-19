import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { landingAt, landingsOf } from '../../../lib/landing.ts';
import { landingMetadata } from '../../../lib/seo.ts';
import { LandingView } from '../../../components/LandingView.tsx';

export const dynamicParams = false;
export function generateStaticParams() {
  return landingsOf('industry').map((p) => ({ slug: p.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const page = landingAt(`/industry/${(await params).slug}`);
  return page ? landingMetadata(page) : {};
}

export default async function IndustryPage({ params }: { params: Promise<{ slug: string }> }) {
  const page = landingAt(`/industry/${(await params).slug}`);
  if (!page) notFound();
  return <LandingView page={page} />;
}
