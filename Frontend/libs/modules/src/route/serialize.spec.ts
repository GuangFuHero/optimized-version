import { describe, expect, it } from 'vitest';

import { parseSiteRouteState } from './parse';
import { createSiteHref } from './serialize';

function roundTrip(path: string): string {
  const segments = path.split('/').filter(Boolean).slice(1);

  return createSiteHref(
    'map',
    parseSiteRouteState('map', segments, new URLSearchParams()),
  );
}

describe('createSiteHref', () => {
  it('leaves the base layer out of a map link when none was picked', () => {
    expect(createSiteHref('map', {})).toBe('/map/station');
    expect(
      createSiteHref('map', {
        dataType: 'ticket',
        subDataTypes: ['pending'],
        position: { center: [23.6, 121.4], zoom: 15 },
      }),
    ).toBe('/map/ticket/pending/@23.6000000,121.4000000,15z');
  });

  it('keeps a picked base layer through a reload', () => {
    expect(roundTrip('/map/nlsc/station')).toBe('/map/nlsc/station');
    expect(
      roundTrip('/map/osm-direct/ticket/pending/@23.6000000,121.4000000,15z'),
    ).toBe('/map/osm-direct/ticket/pending/@23.6000000,121.4000000,15z');
  });

  it('keeps a link without a base layer without one through a reload', () => {
    expect(roundTrip('/map/station')).toBe('/map/station');
    expect(roundTrip('/map/ticket/pending/@23.6000000,121.4000000,15z')).toBe(
      '/map/ticket/pending/@23.6000000,121.4000000,15z',
    );
    expect(roundTrip('/map')).toBe('/map/station');
  });

  it('drops a base layer the site no longer offers, leaving the viewer’s own', () => {
    expect(roundTrip('/map/carto/station')).toBe('/map/station');
  });
});
