// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest';

import {
  ACCOUNT_SECURITY_SIGN_IN_HREF,
  BACK_OFFICE_SIGN_IN_HREF,
  OAUTH_START_PATHS,
  SITE_PATHS,
  sameSiteHref,
  withQuery,
} from './paths';

describe('withQuery', () => {
  it('puts the query after the path', () => {
    expect(withQuery(SITE_PATHS.map, { apply: '1' })).toBe('/map?apply=1');
  });

  it('leaves the path alone when the query is empty', () => {
    expect(withQuery(SITE_PATHS.login, new URLSearchParams())).toBe('/login');
  });

  it('encodes what the query carries', () => {
    expect(
      withQuery(OAUTH_START_PATHS.line, { return_to: '/map?apply=1' }),
    ).toBe('/api/v1/auth/oauth/line/start?return_to=%2Fmap%3Fapply%3D1');
  });
});

describe('the sign-ins that pages without a session send people to', () => {
  it('comes back to 帳號安全', () => {
    expect(ACCOUNT_SECURITY_SIGN_IN_HREF).toBe(
      '/login?callbackUrl=%2Faccount%2Fsecurity',
    );
  });

  it("comes back to the back office's home", () => {
    expect(
      new URL(BACK_OFFICE_SIGN_IN_HREF, 'http://localhost').searchParams.get(
        'callbackUrl',
      ),
    ).toBe('/');
  });
});

describe('sameSiteHref', () => {
  it('keeps a path on this site, query and all', () => {
    expect(sameSiteHref('/map/ticket/t-1?claim=n-1', SITE_PATHS.map)).toBe(
      '/map/ticket/t-1?claim=n-1',
    );
  });

  it.each([
    ['another site', 'https://evil.example/login'],
    ['a path that names another site', '//evil.example/login'],
    ['a backslash the browser reads as a slash', '/\\evil.example/login'],
    ['a tab the browser drops', '/\t/evil.example/login'],
    ['a script', 'javascript:alert(1)'],
    ['a relative path', 'map'],
    ['nothing', ''],
  ])('gives the fallback for %s', (_, href) => {
    expect(sameSiteHref(href, SITE_PATHS.map)).toBe('/map');
  });

  it('gives the fallback when there is no address at all', () => {
    expect(sameSiteHref(null, SITE_PATHS.map)).toBe('/map');
  });
});
