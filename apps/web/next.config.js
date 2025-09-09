/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  transpilePackages: ["@repo/api", "@repo/database", "@repo/ui"]
};
module.exports = {
  reactStrictMode: true,
};
