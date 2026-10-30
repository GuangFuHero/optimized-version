import { describe, expect, it } from 'vitest';

import {
  boundaryChange,
  countInsideArea,
  isInArea,
  viewOfArea,
} from './area-geometry';
import type { RescueMapMarkerItem } from '../types';

// A square from (0,0) to (10,10) with a hole from (4,4) to (6,6).
const SQUARE = {
  polygons: [
    [
      [
        [0, 0],
        [0, 10],
        [10, 10],
        [10, 0],
      ],
      [
        [4, 4],
        [4, 6],
        [6, 6],
        [6, 4],
      ],
    ],
  ] as [number, number][][][],
};

function marker(
  id: string,
  position: [number, number],
  detailType: 'ticket' | 'station',
): RescueMapMarkerItem {
  return {
    id,
    title: id,
    subtitle: '',
    position,
    label: id,
    variant: detailType === 'ticket' ? 'urgent-ticket' : 'resource-station',
    detailType,
  };
}

describe('isInArea', () => {
  it('is true inside the outer ring and false outside it', () => {
    expect(isInArea([2, 2], SQUARE)).toBe(true);
    expect(isInArea([12, 2], SQUARE)).toBe(false);
  });

  it('is false inside a hole', () => {
    expect(isInArea([5, 5], SQUARE)).toBe(false);
  });

  it('is false for an area with no polygon', () => {
    expect(isInArea([1, 1], { polygons: [] })).toBe(false);
  });
});

describe('countInsideArea', () => {
  it('counts tickets and stations apart, leaving out those outside', () => {
    const markers = [
      marker('t1', [2, 2], 'ticket'),
      marker('t2', [8, 8], 'ticket'),
      marker('t3', [20, 20], 'ticket'),
      marker('s1', [3, 7], 'station'),
      marker('s2', [5, 5], 'station'),
    ];

    expect(countInsideArea(SQUARE, markers)).toEqual({
      tickets: 2,
      stations: 1,
    });
  });
});

describe('viewOfArea', () => {
  it('looks at the middle of the area', () => {
    const view = viewOfArea(SQUARE);

    expect(view?.center).toEqual([5, 5]);
    expect(view?.bbox).toEqual([0, 0, 10, 10]);
  });

  it('zooms in closer on a smaller area', () => {
    const small = viewOfArea({
      polygons: [
        [
          [
            [23.66, 121.42],
            [23.67, 121.42],
            [23.67, 121.43],
          ],
        ],
      ],
    });
    const large = viewOfArea(SQUARE);

    expect(small?.zoom).toBeGreaterThan(large?.zoom ?? Infinity);
  });

  it('has no view for an area with nothing drawn', () => {
    expect(viewOfArea({ polygons: [] })).toBeNull();
  });
});

describe('boundaryChange', () => {
  const left: [number, number][] = [
    [0, 0],
    [0, 5],
    [10, 5],
    [10, 0],
  ];
  const wider: [number, number][] = [
    [0, 0],
    [0, 8],
    [10, 8],
    [10, 0],
  ];
  const narrower: [number, number][] = [
    [0, 0],
    [0, 2],
    [10, 2],
    [10, 0],
  ];
  const markers = [
    marker('in-both', [5, 1], 'ticket'),
    marker('only-before', [5, 3], 'ticket'),
    marker('only-after', [5, 7], 'ticket'),
    marker('outside', [5, 9], 'ticket'),
    marker('a-station', [5, 1], 'station'),
  ];

  it('counts what comes in when the boundary grows', () => {
    expect(
      boundaryChange({ polygons: [[left]] }, { polygons: [[wider]] }, markers),
    ).toEqual({ inside: 3, added: 1, removed: 0 });
  });

  it('counts what goes out when the boundary shrinks', () => {
    expect(
      boundaryChange(
        { polygons: [[left]] },
        { polygons: [[narrower]] },
        markers,
      ),
    ).toEqual({ inside: 1, added: 0, removed: 1 });
  });

  it('leaves stations out of it', () => {
    expect(
      boundaryChange({ polygons: [[left]] }, { polygons: [[left]] }, markers),
    ).toEqual({ inside: 2, added: 0, removed: 0 });
  });
});
