import { describe, expect, it } from 'vitest';

import { BASE_LAYER_CONFIG } from '../map/constants';
import { SITE_DATA_TYPES } from './constants';
import { parseSiteRouteState } from './parse';

const noQuery = new URLSearchParams();

describe('parseSiteRouteState', () => {
  it('never takes a base layer for a data type', () => {
    // Every layer the map knows, not only those offered: an old link can name one the site dropped.
    expect(
      Object.keys(BASE_LAYER_CONFIG).filter((layer) =>
        (SITE_DATA_TYPES as readonly string[]).includes(layer),
      ),
    ).toEqual([]);
  });

  it('reads a map link without a base layer, leaving the layer to the viewer', () => {
    expect(parseSiteRouteState('map', ['station'], noQuery)).toMatchObject({
      baseLayer: undefined,
      dataType: 'station',
    });
    expect(
      parseSiteRouteState(
        'map',
        ['ticket', 'pending', '@23.6,121.4,15z'],
        noQuery,
      ),
    ).toMatchObject({
      baseLayer: undefined,
      dataType: 'ticket',
      subDataTypes: ['pending'],
      position: { center: [23.6, 121.4], zoom: 15 },
    });
  });
});

function mapPosition(segments: string[], query = '') {
  return parseSiteRouteState('map', segments, new URLSearchParams(query))
    .position;
}

describe('parseSiteRouteState position', () => {
  it('keeps the zoom of all of Taiwan, where a map opens with no event view set', () => {
    expect(mapPosition(['@23.6500000,120.9500000,7z'])).toEqual({
      center: [23.65, 120.95],
      zoom: 7,
    });
    expect(mapPosition([], 'pos=23.65,120.95,7')).toEqual({
      center: [23.65, 120.95],
      zoom: 7,
    });
  });

  it('holds the zoom to what the map allows, 7 to 18', () => {
    expect(mapPosition(['@23.65,120.95,5z'])?.zoom).toBe(7);
    expect(mapPosition([], 'pos=23.65,120.95,5')?.zoom).toBe(7);
    expect(mapPosition(['@23.65,120.95,20z'])?.zoom).toBe(18);
  });
});
