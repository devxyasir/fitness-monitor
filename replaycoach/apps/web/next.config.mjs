/** @type {import('next').NextConfig} */
const nextConfig = {
  // Transpile shared packages from the monorepo
  transpilePackages: ['@replaycoach/types'],

  // Enforce strict ESLint during builds
  eslint: {
    ignoreDuringBuilds: false,
  },

  // TypeScript errors fail the build
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
