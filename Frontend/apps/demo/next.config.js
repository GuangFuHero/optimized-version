//@ts-check

const { composePlugins, withNx } = require('@nx/next');
const path = require('path');
const {
  contentSecurityPolicy,
  MCP_CONSENT_PATH,
  SITE_SECURITY_HEADERS_SOURCE,
} = require('@rescue-frontend/modules/content-security-policy');

// On every response, the API's and the static files' too, but the MCP consent page's frame headers and CSP
// (SITE_SECURITY_HEADERS_SOURCE says why); the admin app sends the same (apps/admin/next.config.ts).
const securityHeaders = [
  // HTTPS only on this host and those under it, for a week: a browser keeps to it that long, with no
  // way to take it back sooner. A year once every host under the domain is known to be HTTPS only.
  // Not preloaded, which is harder still to undo.
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=604800; includeSubDomains',
  },
  // No other site frames these pages; SAMEORIGIN rather than DENY leaves their own frames working.
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Where scripts, styles, images and fetches may come from; libs/modules/src/http says why each.
  { key: 'Content-Security-Policy', value: contentSecurityPolicy() },
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
    return [
      { source: SITE_SECURITY_HEADERS_SOURCE, headers: securityHeaders },
      {
        source: MCP_CONSENT_PATH,
        headers: securityHeaders.filter(
          ({ key }) =>
            !['X-Frame-Options', 'Content-Security-Policy'].includes(key),
        ),
      },
    ];
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
