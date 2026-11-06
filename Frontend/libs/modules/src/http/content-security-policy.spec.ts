import { describe, expect, it } from 'vitest';

import { buildCustomRoute } from 'next/dist/lib/build-custom-route';

import {
  contentSecurityPolicy,
  MCP_CONSENT_PATH,
  SITE_SECURITY_HEADERS_SOURCE,
} from './content-security-policy.js';

function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy.split(';').map((part) => {
      const [name, ...values] = part.trim().split(/\s+/);
      return [name, values] as const;
    }),
  );
}

describe('contentSecurityPolicy', () => {
  const production = directives(contentSecurityPolicy(false));

  it('lets only the same origin frame the apps, matching X-Frame-Options: SAMEORIGIN', () => {
    expect(production.get('frame-ancestors')).toEqual(["'self'"]);
  });

  it('allows the direct OSM tiles and https photo links as images', () => {
    expect(production.get('img-src')).toEqual([
      "'self'",
      'data:',
      'blob:',
      'https:',
    ]);
  });

  it("lets in Cloudflare's injected analytics beacon and its report, nothing else off-site", () => {
    expect(production.get('script-src')).toEqual([
      "'self'",
      "'unsafe-inline'",
      'https://static.cloudflareinsights.com',
    ]);
    expect(production.get('connect-src')).toEqual([
      "'self'",
      'https://cloudflareinsights.com',
    ]);
  });

  it('keeps fonts, forms and everything else on the same origin', () => {
    expect(production.get('default-src')).toEqual(["'self'"]);
    expect(production.get('font-src')).toEqual(["'self'", 'data:']);
    expect(production.get('form-action')).toEqual(["'self'"]);
    expect(production.get('object-src')).toEqual(["'none'"]);
    expect(production.get('base-uri')).toEqual(["'self'"]);
  });

  it("adds 'unsafe-eval' under next dev only", () => {
    expect(directives(contentSecurityPolicy(true)).get('script-src')).toEqual([
      "'self'",
      "'unsafe-inline'",
      'https://static.cloudflareinsights.com',
      "'unsafe-eval'",
    ]);
  });
});

describe('SITE_SECURITY_HEADERS_SOURCE', () => {
  // The regex `next build` makes of a `headers()` source, so this is the match the server does.
  const matches = (path: string) =>
    new RegExp(
      buildCustomRoute('header', {
        source: SITE_SECURITY_HEADERS_SOURCE,
        headers: [],
      }).regex,
    ).test(path);

  it('covers the pages, the API and the static files', () => {
    for (const path of [
      '/',
      '/login',
      '/api/v1/auth/session',
      '/api/v1/mcp',
      '/api/v1/mcp/consent/other',
      '/_next/static/chunks/main.js',
    ]) {
      expect(matches(path), path).toBe(true);
    }
  });

  // The backend's own frame headers reach that page, and its CSP has no form-action: allowing redirects
  // to the MCP client's address, which `form-action 'self'` would block.
  it('leaves out the MCP consent page', () => {
    expect(MCP_CONSENT_PATH).toBe('/api/v1/mcp/consent');
    expect(matches(MCP_CONSENT_PATH)).toBe(false);
  });
});
