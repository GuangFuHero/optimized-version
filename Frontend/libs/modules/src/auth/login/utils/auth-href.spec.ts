import { describe, expect, it } from 'vitest';

import { authHref } from './auth-href';

/** What the page at the other end reads back. */
function read(href: string) {
  const url = new URL(href, 'http://localhost');
  return { pathname: url.pathname, params: url.searchParams };
}

describe('authHref', () => {
  it('is the bare page when no page is waiting for the sign-in', () => {
    expect(authHref('/forgot-password', { callbackUrl: null })).toBe(
      '/forgot-password',
    );
  });

  it("hands on the page to come back to — a map address with A's claim and B's help — exactly", () => {
    const callbackUrl =
      '/map/osm-direct/station/@23.8690420,121.0305405,13z?id=1b2c&claim=9f&help=23.8,121.0';
    const { pathname, params } = read(authHref('/register', { callbackUrl }));

    expect(pathname).toBe('/register');
    expect(params.get('callbackUrl')).toBe(callbackUrl);
    expect([...params.keys()]).toEqual(['callbackUrl']);
  });

  it('takes the account on to the reset page, beside the page to come back to', () => {
    const { pathname, params } = read(
      authHref('/reset-password', {
        callbackUrl: '/list/station',
        identity: { type: 'phone', value: '+886912345678' },
      }),
    );

    expect(pathname).toBe('/reset-password');
    expect(params.get('type')).toBe('phone');
    expect(params.get('value')).toBe('+886912345678');
    expect(params.get('callbackUrl')).toBe('/list/station');
  });

  it('takes the account on without a page to come back to', () => {
    const { params } = read(
      authHref('/reset-password', {
        callbackUrl: null,
        identity: { type: 'email', value: 'hua@example.com' },
      }),
    );

    expect(params.get('value')).toBe('hua@example.com');
    expect(params.has('callbackUrl')).toBe(false);
  });
});
