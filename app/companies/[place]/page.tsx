import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { landingAt, landings } from '../../../lib/landing.ts';
import { landingMetadata } from '../../../lib/seo.ts';
import { LandingView } from '../../../components/LandingView.tsx';

// Regional hub or municipal city landing route (e.g. /companies/lahore, /companies/twin-cities).
export const dynamicParams = false;
export function generateStaticParams() {
  return landings().filter((p) => p.kind === 'hub' || p.kind === 'city').map((p) => ({ place: p.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ place: string }> }): Promise<Metadata> {
  const page = landingAt(`/companies/${(await params).place}`);
  return page ? landingMetadata(page) : {};
}

export default async function PlacePage({ params }: { params: Promise<{ place: string }> }) {
  const page = landingAt(`/companies/${(await params).place}`);
  if (!page) notFound();
  return <LandingView page={page} />;
}
