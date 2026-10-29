import { describe, expect, it } from 'vitest';

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
