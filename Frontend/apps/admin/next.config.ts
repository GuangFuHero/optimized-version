import { composePlugins, withNx } from '@nx/next';
import type { WithNxOptions } from '@nx/next/plugins/with-nx';
import path from 'node:path';

// On every response, as the site's (apps/demo/next.config.js), which explains each.
const securityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
];

const nextConfig = {
  nx: {},
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  transpilePackages: [
    '@rescue-frontend/ui',
    '@rescue-frontend/modules',
    '@rescue-frontend/data-access',
  ],
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../..'),
  turbopack: { root: path.join(__dirname, '../..') },
} satisfies WithNxOptions;

export default composePlugins(withNx)(nextConfig);
