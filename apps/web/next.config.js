/** @type {import('next').NextConfig} */
const API_ORIGIN = process.env.MEALS_API_INTERNAL_ORIGIN || 'http://localhost:4000';

const nextConfig = {
  transpilePackages: ['@repo/ui'],
  reactStrictMode: true,
  output: 'standalone',
  experimental: {
    // The demo-mode route handler runs the real tRPC router against an
    // embedded PGlite database; these packages must stay unbundled so
    // Prisma's engine and PGlite's wasm assets resolve from node_modules.
    serverComponentsExternalPackages: [
      '@repo/api',
      '@repo/database',
      '@prisma/client',
      '@electric-sql/pglite',
      'pglite-prisma-adapter',
    ],
    outputFileTracingIncludes: {
      '/api/demo/[trpc]': [
        '../../packages/database/prisma/migrations/**',
        '../../node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/**',
      ],
    },
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // serverComponentsExternalPackages silently falls back to bundling
      // when a package is not resolvable the way Next expects (pnpm
      // workspace symlinks), which breaks Prisma's native engine and the
      // demo database's migration files. Force these to stay external.
      config.externals.push(
        { '@repo/api': 'import @repo/api' },
        { '@repo/database': 'import @repo/database' },
        { '@prisma/client': 'commonjs @prisma/client' },
      );
    }
    return config;
  },
  async rewrites() {
    // In demo mode there is no external API: tRPC is served by the in-app
    // route handler at /api/demo, so nothing should be proxied.
    const demoFlag = (process.env.NEXT_PUBLIC_DEMO_MODE ?? '').trim().toLowerCase();
    if (demoFlag === '1' || demoFlag === 'true') return [];

    return [
      { source: '/api/:path*', destination: `${API_ORIGIN}/:path*` },
      { source: '/auth/:path*', destination: `${API_ORIGIN}/auth/:path*` },
    ];
  },
};

module.exports = nextConfig;
