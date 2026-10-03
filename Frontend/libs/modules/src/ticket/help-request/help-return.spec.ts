import { describe, expect, it } from 'vitest';

import {
  buildHelpSignInHref,
  readHelpReturn,
  stripHelpReturn,
} from './help-return';

/** The page a sign-in link sends the guest back to. */
function callbackOf(href: string): URL {
  const callbackUrl = new URL(href, 'http://site.test').searchParams.get(
    'callbackUrl',
  );

  return new URL(callbackUrl ?? '', 'http://site.test');
}

describe('buildHelpSignInHref', () => {
  it('sends a guest to sign in and back to the same page, with what they were looking at', () => {
    const back = callbackOf(
      buildHelpSignInHref(
        { pathname: '/list/ticket', search: '?search=泥&id=t-1' },
        null,
      ),
    );

    expect(back.pathname).toBe('/list/ticket');
    expect(back.searchParams.get('search')).toBe('泥');
    expect(back.searchParams.get('id')).toBe('t-1');
    expect(back.searchParams.get('help')).toBe('1');
  });

  it('keeps the whole map address, which the site rewrites in place, not just /map', () => {
    const back = callbackOf(
      buildHelpSignInHref(
        { pathname: '/map/osm-direct/ticket/@23.67,121.42,15z', search: '' },
        null,
      ),
    );

    expect(back.pathname).toBe('/map/osm-direct/ticket/@23.67,121.42,15z');
  });

  it('carries the point picked on the map, so it comes back with them', () => {
    const back = callbackOf(
      buildHelpSignInHref(
        { pathname: '/map', search: '' },
        { lat: 23.6725, lng: 121.4235 },
      ),
    );

    expect(back.searchParams.get('help')).toBe('23.672500,121.423500');
  });
});

describe('readHelpReturn', () => {
  const query = (search: string) => new URLSearchParams(search);

  it('finds nothing to reopen on an ordinary address', () => {
    expect(readHelpReturn(query('id=t-1'))).toBeNull();
  });

  it('reopens without a point after a guest pressed a button', () => {
    expect(readHelpReturn(query('help=1'))).toEqual({ seed: null });
  });

  it('reopens at the point that went with them', () => {
    expect(readHelpReturn(query('help=23.672500,121.423500'))).toEqual({
      seed: { lat: 23.6725, lng: 121.4235 },
    });
  });

  it('still reopens, only without a point, when the point is not one', () => {
    expect(readHelpReturn(query('help=abc'))).toEqual({ seed: null });
    expect(readHelpReturn(query('help=123,456'))).toEqual({ seed: null });
  });
});

describe('stripHelpReturn', () => {
  it('takes the marker off once read, so a reload or a copied link does not reopen the drawer', () => {
    expect(stripHelpReturn('/list/ticket?id=t-1&help=1')).toBe(
      '/list/ticket?id=t-1',
    );
  });

  it('hands an address without one back as it came', () => {
    expect(stripHelpReturn('/list/ticket?search=a%20b')).toBe(
      '/list/ticket?search=a%20b',
    );
  });
});
