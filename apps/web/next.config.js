/** @type {import('next').NextConfig} */
const API_ORIGIN = process.env.MEALS_API_INTERNAL_ORIGIN || 'http://localhost:4000';

const nextConfig = {
  transpilePackages: ['@repo/ui'],
  reactStrictMode: true,
  output: 'standalone',
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${API_ORIGIN}/:path*` },
    ];
  },
};

module.exports = nextConfig;
