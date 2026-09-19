import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The development badge sits over the list's bottom corner; the owner reviews pages on the dev server.
  devIndicators: false,
};

export default config;
