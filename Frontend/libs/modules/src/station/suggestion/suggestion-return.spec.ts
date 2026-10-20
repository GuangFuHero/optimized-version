import { describe, expect, it } from 'vitest';

import {
  buildSuggestionSignInHref,
  readSuggestionReturn,
  stripSuggestionReturn,
} from './suggestion-return';

describe('buildSuggestionSignInHref', () => {
  it('signs in, then comes back to the same page with the station to suggest on', () => {
    const href = buildSuggestionSignInHref(
      {
        pathname: '/map/osm-direct/station/@23.65,121.42,15z',
        search: '?id=s-1',
      },
      's-1',
    );
    const callbackUrl = new URL(href, 'http://site.invalid').searchParams.get(
      'callbackUrl',
    );

    expect(href.startsWith('/login?callbackUrl=')).toBe(true);
    expect(callbackUrl).toBe(
      '/map/osm-direct/station/@23.65,121.42,15z?id=s-1&suggest=s-1',
    );
  });
});

describe('readSuggestionReturn', () => {
  it('reads the station, and nothing from an address without one', () => {
    expect(
      readSuggestionReturn(new URLSearchParams('id=s-1&suggest=s-1')),
    ).toBe('s-1');
    expect(readSuggestionReturn(new URLSearchParams('id=s-1'))).toBeNull();
    expect(readSuggestionReturn(new URLSearchParams('suggest='))).toBeNull();
  });
});

describe('stripSuggestionReturn', () => {
  it('takes the marker off and keeps the rest', () => {
    expect(stripSuggestionReturn('/list/station?id=s-1&suggest=s-1#top')).toBe(
      '/list/station?id=s-1#top',
    );
  });

  it('hands an address without it back as it came', () => {
    expect(stripSuggestionReturn('/list/station?q=a%20b')).toBe(
      '/list/station?q=a%20b',
    );
  });
});
