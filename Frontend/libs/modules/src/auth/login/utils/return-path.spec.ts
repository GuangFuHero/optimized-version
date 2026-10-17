import { describe, expect, it } from 'vitest';

import { oauthStartHref, safeReturnPath } from './return-path';

describe('safeReturnPath', () => {
  it("keeps a page on this site, with what its address says (A's claim=)", () => {
    expect(safeReturnPath('/map/ticket/t-1?claim=n-1', '/map')).toBe(
      '/map/ticket/t-1?claim=n-1',
    );
  });

  it('sends the person to the fallback instead of another site', () => {
    expect(safeReturnPath('https://evil.example/login', '/map')).toBe('/map');
  });

  it('turns away an address that starts like a path but names another site', () => {
    expect(safeReturnPath('//evil.example/login', '/map')).toBe('/map');
  });

  it('turns away a backslash the browser would read as the second slash', () => {
    expect(safeReturnPath('/\\evil.example/login', '/map')).toBe('/map');
  });
});

describe('oauthStartHref', () => {
  it('starts the sign-in with the backend, to come back to the page that asked', () => {
    const href = new URL(
      oauthStartHref('google', {
        app: 'site',
        callbackUrl: '/map/ticket/t-1?claim=n-1',
        fallback: '/map',
      }),
      'http://localhost:3000',
    );

    expect({
      path: href.pathname,
      app: href.searchParams.get('app'),
      returnTo: href.searchParams.get('return_to'),
    }).toEqual({
      path: '/api/v1/auth/oauth/google/start',
      app: 'site',
      returnTo: '/map/ticket/t-1?claim=n-1',
    });
  });

  it('never hands the backend another site to come back to', () => {
    const href = new URL(
      oauthStartHref('line', {
        app: 'site',
        callbackUrl: '//evil.example/login',
        fallback: '/map',
      }),
      'http://localhost:3000',
    );

    expect(href.searchParams.get('return_to')).toBe('/map');
  });
});
