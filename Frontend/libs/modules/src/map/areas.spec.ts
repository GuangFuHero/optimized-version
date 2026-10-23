import { describe, expect, it } from 'vitest';

import {
  areaLabelPlacement,
  areaPopupLines,
  areaSignature,
  areaTitle,
  isAreaKind,
  largestAreasFirst,
} from './areas';
import type { RescueMapPublicZone } from './types';

const ZONE: RescueMapPublicZone = {
  id: 'zone-1',
  name: '大平村',
  comment: '物資放村辦公處',
  polygons: [
    [
      [
        [23.66, 121.42],
        [23.67, 121.42],
        [23.67, 121.43],
      ],
    ],
  ],
  kind: 'team_zone',
  teams: ['慈濟基金會', '紅十字會'],
};

describe('areaTitle', () => {
  it('writes the kind before the name, and the kind alone for an area without one', () => {
    expect(areaTitle(ZONE)).toBe('責任區・大平村');
    expect(areaTitle({ ...ZONE, kind: 'mark_zone', name: null })).toBe(
      '標示區',
    );
    expect(
      areaTitle({
        id: 'hazard-1',
        name: '堤防潰口',
        comment: null,
        polygons: [],
      }),
    ).toBe('危險區・堤防潰口');
  });
});

describe('areaPopupLines', () => {
  it("tells a 責任區's title, its teams and its note, one to a line", () => {
    expect(areaPopupLines(ZONE)).toEqual([
      '責任區・大平村',
      '負責：慈濟基金會、紅十字會',
      '物資放村辦公處',
    ]);
  });

  it('leaves out what an area does not have: teams, or a note of only spaces', () => {
    expect(
      areaPopupLines({
        ...ZONE,
        kind: 'mark_zone',
        teams: [],
        comment: '  ',
      }),
    ).toEqual(['標示區・大平村']);
    expect(
      areaPopupLines({
        id: 'hazard-1',
        name: '堤防潰口',
        comment: null,
        polygons: [],
      }),
    ).toEqual(['危險區・堤防潰口']);
  });
});

describe('areaLabelPlacement', () => {
  const label = { width: 100, height: 22 };

  it('puts the label in the middle of an area with 8px to spare all round', () => {
    expect(areaLabelPlacement({ width: 116, height: 38 }, label)).toBe(
      'center',
    );
  });

  it('hangs it below an area too narrow or too short for it, such as a 休息區', () => {
    expect(areaLabelPlacement({ width: 115, height: 200 }, label)).toBe(
      'below',
    );
    expect(areaLabelPlacement({ width: 300, height: 37 }, label)).toBe('below');
  });
});

describe('areaSignature', () => {
  it('changes when the shape moves, even by a point kept in number', () => {
    const moved = {
      ...ZONE,
      polygons: [
        [
          [
            [23.66, 121.42],
            [23.67, 121.42],
            [23.68, 121.43],
          ],
        ],
      ] as RescueMapPublicZone['polygons'],
    };

    expect(areaSignature(moved)).not.toBe(areaSignature(ZONE));
  });

  it('changes with the kind, which decides the colour', () => {
    expect(areaSignature({ ...ZONE, kind: 'mark_zone', teams: [] })).not.toBe(
      areaSignature({ ...ZONE, teams: [] }),
    );
  });
});

describe('largestAreasFirst', () => {
  const square = (id: string, size: number) => ({
    ...ZONE,
    id,
    polygons: [
      [
        [
          [23.6, 121.4],
          [23.6 + size, 121.4],
          [23.6 + size, 121.4 + size],
        ],
      ],
    ] as RescueMapPublicZone['polygons'],
  });

  it('puts a township before the village zone inside it, so the village is drawn over it', () => {
    expect(
      largestAreasFirst([
        square('village', 0.01),
        square('township', 0.2),
        square('street', 0.001),
      ]).map((area) => area.id),
    ).toEqual(['township', 'village', 'street']);
  });

  it('measures every part of a MultiPolygon, and an area with no shape as nothing', () => {
    const twoParts = {
      ...square('two-parts', 0.01),
      polygons: [
        ...square('', 0.01).polygons,
        [
          [
            [23.9, 121.9],
            [23.91, 121.9],
            [23.91, 121.91],
          ],
        ],
      ] as RescueMapPublicZone['polygons'],
    };

    expect(
      largestAreasFirst([
        { ...ZONE, id: 'empty', polygons: [] },
        square('one-part', 0.1),
        twoParts,
      ]).map((area) => area.id),
    ).toEqual(['two-parts', 'one-part', 'empty']);
  });
});

describe('isAreaKind', () => {
  it('knows the three kinds, and nothing that only looks like one', () => {
    expect(['hazardous_zone', 'team_zone', 'mark_zone'].every(isAreaKind)).toBe(
      true,
    );
    expect(isAreaKind('toString')).toBe(false);
    expect(isAreaKind('base')).toBe(false);
  });
});
