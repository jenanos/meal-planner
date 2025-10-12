/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@repo/ui'],
  reactStrictMode: true,
  output: 'standalone',
  // Skip lint and type checking during build in Docker
  // (we run these separately in CI)
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  async rewrites() {
    return [
      { source: '/api/:path*', destination: 'http://api:4000/:path*' },
    ];
  },
};

module.exports = nextConfig;
