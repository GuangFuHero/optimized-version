import { describe, expect, it } from 'vitest';

import {
  getPresentStationTypes,
  getStationTypePinColor,
  OTHER_STATION_PIN_COLOR,
  STATION_TYPE_PIN_COLORS,
  toStationMarker,
} from './station-marker';
import type { StationRow } from './station-row';

const row = {
  uuid: 's1',
  name: '光復加水站',
  type: 'water',
  operationalStatus: 'active',
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

  it('draws a pin in the type colour, faded when closed, outlined when selected', () => {
    expect(toStationMarker(row)?.pin).toEqual({
      color: STATION_TYPE_PIN_COLORS.water,
      dimmed: false,
      selected: false,
    });
    expect(
      toStationMarker({ ...row, operationalStatus: 'temporarily_closed' }, true)
        ?.pin,
    ).toMatchObject({ dimmed: true, selected: true });
    expect(toStationMarker(row)?.tooltip).toEqual({
      title: '光復加水站',
      subtitle: '加水 · 光復鄉',
    });
  });
});

describe('getStationTypePinColor', () => {
  it('falls back to the neutral pin for an unknown or missing type', () => {
    expect(getStationTypePinColor('Medical')).toBe(
      STATION_TYPE_PIN_COLORS.medical,
    );
    expect(getStationTypePinColor('bakery')).toBe(OTHER_STATION_PIN_COLOR);
    expect(getStationTypePinColor(null)).toBe(OTHER_STATION_PIN_COLOR);
  });
});

describe('getPresentStationTypes', () => {
  it('lists the mapped types once each, in the type list order', () => {
    const rows = [
      { ...row, uuid: 'a', type: 'medical', typeLabel: '醫療' },
      { ...row, uuid: 'b', type: 'water', typeLabel: '加水' },
      { ...row, uuid: 'c', type: 'medical', typeLabel: '醫療' },
      { ...row, uuid: 'd', type: 'shelter', typeLabel: '避難', position: null },
    ];
    expect(getPresentStationTypes(rows).map((t) => t.type)).toEqual([
      'water',
      'medical',
    ]);
  });
});
