import path from 'node:path';
import type { NextConfig } from 'next';
import packageJson from './package.json';

const apiBasePath = process.env.NEXT_PUBLIC_API_BASE_PATH ?? '/api';
const apiProxyTarget = process.env.API_PROXY_TARGET || process.env.API_INTERNAL_URL;

if (!apiProxyTarget && !process.env.VERCEL) {
  throw new Error('API_PROXY_TARGET is not set. Copy apps/web/.env.example to apps/web/.env.local (npm run env).');
}

// The Docker image sets NEXT_OUTPUT=standalone to ship a minimal self-contained server.
const standalone = process.env.NEXT_OUTPUT === 'standalone';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
  },
  // Keep the dev-only badge away from the sidebar.
  devIndicators: { position: 'bottom-right' },
  async rewrites() {
    if (!apiProxyTarget) return [];
    return [{ source: `${apiBasePath}/:path*`, destination: `${apiProxyTarget}/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
