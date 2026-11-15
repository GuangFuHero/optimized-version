import { composePlugins, withNx } from '@nx/next';
import type { WithNxOptions } from '@nx/next/plugins/with-nx';
import path from 'node:path';

import { contentSecurityPolicy } from '@rescue-frontend/modules/content-security-policy';

// On every response, as the site's (apps/demo/next.config.js), which explains each.
const securityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=604800; includeSubDomains',
  },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Content-Security-Policy', value: contentSecurityPolicy() },
];

const nextConfig = {
  nx: {},
  poweredByHeader: false,
  reactCompiler: true,
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
