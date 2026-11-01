//@ts-check

const { composePlugins, withNx } = require('@nx/next');
const path = require('path');

// On every response, the API's and the static files' too; the admin app sends the same
// (apps/admin/next.config.ts). No Content-Security-Policy yet: it has to let the map's tiles and
// the fonts through first.
const securityHeaders = [
  // HTTPS only, for a year, on this host and those under it. Not preloaded, which is hard to undo.
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  },
  // No other site frames these pages; SAMEORIGIN rather than DENY leaves their own frames working.
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
];

/**
 * @type {import('@nx/next/plugins/with-nx').WithNxOptions}
 **/
const nextConfig = {
  // Use this to set Nx-specific options
  // See: https://nx.dev/recipes/next/next-config-setup
  nx: {},
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  async redirects() {
    const adminAppUrl =
      process.env.ADMIN_APP_URL ??
      (process.env.NODE_ENV === 'production'
        ? undefined
        : 'http://localhost:3001');

    return adminAppUrl
      ? [
          {
            source: '/admin/:path*',
            destination: `${adminAppUrl}/:path*`,
            permanent: false,
          },
        ]
      : [];
  },

  transpilePackages: [
    '@rescue-frontend/ui',
    '@rescue-frontend/modules',
    '@rescue-frontend/data-access',
  ],
  // Standalone output for a lean production Docker image: a self-contained server.js plus
  // traced node_modules. outputFileTracingRoot points at the monorepo root so workspace
  // libs are traced correctly.
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../..'),
  turbopack: {
    root: path.join(__dirname, '../..'),
  },
};

const plugins = [
  // Add more Next.js plugins to this list if needed.
  withNx,
];

module.exports = composePlugins(...plugins)(nextConfig);
