import { describe, expect, it } from 'vitest';

import { stationPoint } from './station-point';

describe('stationPoint', () => {
  it('turns a GeoJSON point into [lat, lng]', () => {
    expect(
      stationPoint({ type: 'Point', coordinates: [121.42, 23.67] }),
    ).toEqual([23.67, 121.42]);
  });

  it('is null without a usable point', () => {
    expect(stationPoint(null)).toBeNull();
    expect(stationPoint({ type: 'Point' })).toBeNull();
    expect(stationPoint({ type: 'Point', coordinates: [121.42] })).toBeNull();
    expect(
      stationPoint({ type: 'Polygon', coordinates: [[[121, 23]]] }),
    ).toBeNull();
  });
});
