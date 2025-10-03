/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@repo/ui'],
  reactStrictMode: true,
  output: 'standalone',
  async rewrites() {
    return [
      { source: '/api/:path*', destination: 'http://api:4000/:path*' },
    ];
  },
};

module.exports = nextConfig;
