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
