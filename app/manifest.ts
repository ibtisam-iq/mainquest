import type { MetadataRoute } from 'next';

// Web application manifest for PWA and mobile home-screen metadata.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'mainquest: IT companies in Pakistan',
    short_name: 'mainquest',
    description: 'A directory of IT companies in Pakistan, filterable by city, area, industry and specialty.',
    start_url: '/',
    display: 'browser',
    background_color: '#f6f8f7',
    theme_color: '#0f1f1a',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
