import { describe, expect, it } from 'vitest';

import { contentSecurityPolicy } from './content-security-policy.js';

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
