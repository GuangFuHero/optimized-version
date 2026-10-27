import { describe, expect, it } from 'vitest';

import { parseSiteRouteState } from './parse';

const noQuery = new URLSearchParams();

describe('parseSiteRouteState', () => {
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
