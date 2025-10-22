/** @type {import('next').NextConfig} */
const API_ORIGIN = process.env.MEALS_API_INTERNAL_ORIGIN || 'http://meals-api:4000';
const MOCK_MODE = process.env.NEXT_PUBLIC_MOCK_MODE === 'true';

const nextConfig = {
  transpilePackages: ['@repo/ui'],
  reactStrictMode: true,
  output: 'standalone',
  async rewrites() {
    // Skip API rewrites when in mock mode
    if (MOCK_MODE) {
      return [];
    }
    return [
      { source: '/api/:path*', destination: `${API_ORIGIN}/:path*` },
    ];
  },
};

module.exports = nextConfig;
