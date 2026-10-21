import { describe, expect, it } from 'vitest';

import { toStationMarker } from './station-marker';
import type { StationRow } from './station-row';

const row = {
  uuid: 's1',
  name: '光復加水站',
  typeLabel: '加水',
  area: '光復鄉',
  position: [23.6, 121.4],
  raw: {
    type: 'water',
    operationalStatus: 'active',
    isOfficial: false,
    source: 'official',
  },
} as unknown as StationRow;

describe('toStationMarker', () => {
  it('maps a row with a point', () => {
    expect(toStationMarker(row)).toMatchObject({
      id: 's1',
      title: '光復加水站',
      subtitle: '加水 · 光復鄉',
      position: [23.6, 121.4],
      variant: 'resource-station',
      detailType: 'station',
    });
  });

  it('skips a row without a point', () => {
    expect(toStationMarker({ ...row, position: null })).toBeNull();
  });
});
