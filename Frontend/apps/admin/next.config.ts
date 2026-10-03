import { composePlugins, withNx } from '@nx/next';
import type { WithNxOptions } from '@nx/next/plugins/with-nx';
import path from 'node:path';

const nextConfig = {
  nx: {},
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
