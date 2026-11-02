import { afterEach, describe, expect, it, vi } from 'vitest';

import { originFromHeaders, siteOrigin } from './request-origin';

describe('originFromHeaders', () => {
  it('takes the host and scheme the proxy forwarded', () => {
    expect(
      originFromHeaders(
        new Headers({
          host: 'demo:3000',
          'x-forwarded-host': 'site.example',
          'x-forwarded-proto': 'https',
        }),
      ),
    ).toBe('https://site.example');
  });

  it('falls back to the host it was called on, over http', () => {
    expect(originFromHeaders(new Headers({ host: 'localhost:3200' }))).toBe(
      'http://localhost:3200',
    );
  });

  it('names localhost when the request names no host at all', () => {
    expect(originFromHeaders(new Headers())).toBe('http://localhost:3000');
  });

  it('takes the first of two forwarded hosts', () => {
    expect(
      originFromHeaders(
        new Headers({
          'x-forwarded-host': 'a.example, b.example',
          'x-forwarded-proto': 'https',
        }),
      ),
    ).toBe('https://a.example');
  });

  it('takes the first of two forwarded schemes', () => {
    expect(
      originFromHeaders(
        new Headers({
          'x-forwarded-host': 'site.example',
          'x-forwarded-proto': 'https,http',
        }),
      ),
    ).toBe('https://site.example');
  });

  it('gives a forwarded host that makes no URL way to the request host, then to localhost', () => {
    expect(
      originFromHeaders(
        new Headers({ host: 'demo:3000', 'x-forwarded-host': 'not a host' }),
      ),
    ).toBe('http://demo:3000');
    expect(
      originFromHeaders(new Headers({ 'x-forwarded-host': 'not a host' })),
    ).toBe('http://localhost:3000');
  });

  it('speaks http for any scheme but https', () => {
    expect(
      originFromHeaders(
        new Headers({
          'x-forwarded-host': 'site.example',
          'x-forwarded-proto': 'javascript',
        }),
      ),
    ).toBe('http://site.example');
  });
});

describe('siteOrigin', () => {
  const spoofed = new Headers({
    host: 'demo:3000',
    'x-forwarded-host': 'attacker.example',
    'x-forwarded-proto': 'https',
  });

  it('is the configured site, whatever the request says', () => {
    expect(siteOrigin('https://staging.example', spoofed)).toBe(
      'https://staging.example',
    );
  });

  it('keeps only the origin of what is configured', () => {
    expect(siteOrigin('https://staging.example/', spoofed)).toBe(
      'https://staging.example',
    );
  });

  it('reads the request without a site configured, or with one that makes no URL', () => {
    expect(siteOrigin(undefined, spoofed)).toBe('https://attacker.example');
    expect(siteOrigin('staging.example', spoofed)).toBe(
      'https://attacker.example',
    );
    expect(siteOrigin('localhost:3000', spoofed)).toBe(
      'https://attacker.example',
    );
  });
});

describe('siteOrigin without SITE_APP_URL in production', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  // A fresh copy each time: the module says it once per process.
  async function freshSiteOrigin(nodeEnv: string) {
    vi.stubEnv('NODE_ENV', nodeEnv);
    vi.resetModules();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { siteOrigin: fresh } = await import('./request-origin');

    return { fresh, warn };
  }

  const request = new Headers({ host: 'demo:3000' });

  it('says so once in the log, and still answers', async () => {
    const { fresh, warn } = await freshSiteOrigin('production');

    expect(fresh(undefined, request)).toBe('http://demo:3000');
    expect(fresh('staging.example', request)).toBe('http://demo:3000');
    expect(warn).toHaveBeenCalledOnce();
  });

  it('says nothing with a site configured, or outside production', async () => {
    const configured = await freshSiteOrigin('production');
    configured.fresh('https://staging.example', request);
    expect(configured.warn).not.toHaveBeenCalled();

    const development = await freshSiteOrigin('development');
    development.fresh(undefined, request);
    expect(development.warn).not.toHaveBeenCalled();
  });
});
