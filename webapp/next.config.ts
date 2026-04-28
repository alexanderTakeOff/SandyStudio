import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Local-first deployment per webapp.md §2: never deployed to Vercel.
  // Server runs on Director's workstation under PM2 (Phase 8).
  experimental: {
    // Server Actions are enabled by default in Next.js 15.
  },
  // Three.js needs to be transpiled for some legacy CJS interop.
  transpilePackages: ['three'],
};

export default nextConfig;
