import { describe, expect, it } from 'vitest';

import { siteMapUrl } from './site-map-url';

describe('siteMapUrl', () => {
  it("opens the map on the site's origin", () => {
    expect(siteMapUrl('https://staging.wan-guard.com')).toBe(
      'https://staging.wan-guard.com/map',
    );
    expect(siteMapUrl('http://localhost:3000/')).toBe(
      'http://localhost:3000/map',
    );
  });

  it('names no link without an origin', () => {
    expect(siteMapUrl(undefined)).toBeNull();
    expect(siteMapUrl('')).toBeNull();
  });

  it('names no link, rather than throwing, for a value with no scheme', () => {
    expect(siteMapUrl('staging.wan-guard.com')).toBeNull();
    expect(siteMapUrl('localhost:3000')).toBeNull();
  });
});
