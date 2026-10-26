import { describe, expect, it } from 'vitest';

import {
  areaLabelOpensPopup,
  areaLabelText,
  areaPopupLines,
  areaSignature,
  areaTitle,
  isAreaKind,
  largestAreasFirst,
  placeAreaLabels,
  type AreaLabelRequest,
  type ScreenBox,
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

  it('trims the name, and takes one of only spaces for none', () => {
    expect(areaTitle({ ...ZONE, name: '  大平村 ' })).toBe('責任區・大平村');
    expect(areaTitle({ ...ZONE, name: '   ' })).toBe('責任區');
  });
});

describe('areaLabelText', () => {
  it('writes a name of up to 10 characters whole', () => {
    expect(areaLabelText(ZONE)).toBe('責任區・大平村');
    expect(areaLabelText({ ...ZONE, name: '一二三四五六七八九十' })).toBe(
      '責任區・一二三四五六七八九十',
    );
  });

  it('cuts a longer name to its first 9 characters and 「…」', () => {
    expect(areaLabelText({ ...ZONE, name: '光復國小操場北側臨時集合點' })).toBe(
      '責任區・光復國小操場北側臨…',
    );
  });

  it('counts a rare character as one, though a string counts it as two', () => {
    const name = '𥕢二三四五六七八九十';

    expect(name.length).toBe(11);
    expect(areaLabelText({ ...ZONE, name })).toBe(`責任區・${name}`);
    expect(areaLabelText({ ...ZONE, name: `${name}一` })).toBe(
      '責任區・𥕢二三四五六七八九…',
    );
  });

  it('counts the name trimmed, and writes the kind alone for none', () => {
    expect(areaLabelText({ ...ZONE, name: ' 一二三四五六七八九十 ' })).toBe(
      '責任區・一二三四五六七八九十',
    );
    expect(areaLabelText({ ...ZONE, name: null })).toBe('責任區');
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

describe('areaLabelOpensPopup', () => {
  const MARK: RescueMapPublicZone = {
    ...ZONE,
    kind: 'mark_zone',
    teams: [],
    comment: null,
  };

  it('opens when the popup tells more than the label: teams or a note', () => {
    expect(areaLabelOpensPopup(ZONE)).toBe(true);
    expect(areaLabelOpensPopup({ ...MARK, comment: '物資放這' })).toBe(true);
    expect(areaLabelOpensPopup(MARK)).toBe(false);
  });

  it('opens for a name the label cut short, to tell it whole', () => {
    const long = { ...MARK, name: '光復國小操場北側臨時集合點' };

    expect(areaLabelOpensPopup(long)).toBe(true);
    expect(areaPopupLines(long)).toEqual([
      '標示區・光復國小操場北側臨時集合點',
    ]);
  });
});

describe('placeAreaLabels', () => {
  const LABEL = { width: 100, height: 22 };
  const SCREEN = {
    width: 400,
    height: 300,
    obstacles: [],
    isCovered: () => false,
  };
  const box = (left: number, top: number, right: number, bottom: number) => ({
    left,
    top,
    right,
    bottom,
  });
  const request = (area: ScreenBox, hazard = false): AreaLabelRequest => ({
    hazard,
    area,
    label: LABEL,
  });
  // Too small for a label inside: a 休息區.
  const SMALL = box(190, 140, 210, 160);

  it('puts the label in the middle of an area with room for it', () => {
    expect(placeAreaLabels([request(box(50, 50, 350, 250))], SCREEN)).toEqual([
      { place: 'center', x: 200, y: 150 },
    ]);
  });

  it('moves it off a cell count to the nearest clear point inside the area', () => {
    expect(
      placeAreaLabels([request(box(50, 50, 350, 250))], {
        ...SCREEN,
        obstacles: [box(180, 140, 220, 160)],
      }),
    ).toEqual([{ place: 'center', x: 200, y: 109.5 }]);
  });

  it('looks only at the part of an area on screen, as a township reaches far off it', () => {
    expect(
      placeAreaLabels([request(box(-1000, -1000, 1200, 1000))], SCREEN),
    ).toEqual([{ place: 'center', x: 200, y: 150 }]);
  });

  it('hangs it below an area too small for it, then above, then to its right', () => {
    expect(placeAreaLabels([request(SMALL)], SCREEN)).toEqual([
      { place: 'below', x: 200, y: 175 },
    ]);
    expect(
      placeAreaLabels([request(SMALL)], {
        ...SCREEN,
        obstacles: [box(190, 170, 210, 180)],
      }),
    ).toEqual([{ place: 'above', x: 200, y: 125 }]);
    expect(
      placeAreaLabels([request(SMALL)], {
        ...SCREEN,
        obstacles: [box(190, 170, 210, 180), box(190, 120, 210, 130)],
      }),
    ).toEqual([{ place: 'right', x: 264, y: 150 }]);
  });

  it('leaves the label out when nowhere is clear', () => {
    expect(
      placeAreaLabels([request(SMALL)], { ...SCREEN, isCovered: () => true }),
    ).toEqual([{ place: 'hidden' }]);
  });

  it('keeps it on screen and off what floats over the map', () => {
    expect(placeAreaLabels([request(box(190, 280, 210, 295))], SCREEN)).toEqual(
      [{ place: 'above', x: 200, y: 265 }],
    );
    expect(
      placeAreaLabels([request(box(50, 0, 350, 300))], {
        ...SCREEN,
        isCovered: (label) => label.left < 190,
      }),
    ).toEqual([{ place: 'center', x: 246, y: 150 }]);
  });

  it('leaves out the label of an area off screen', () => {
    expect(placeAreaLabels([request(box(500, 50, 600, 100))], SCREEN)).toEqual([
      { place: 'offscreen' },
    ]);
  });

  it('lets a 危險區 choose first, then the smaller area, and no two labels overlap', () => {
    const larger = box(185, 140, 215, 160);

    expect(placeAreaLabels([request(larger), request(SMALL)], SCREEN)).toEqual([
      { place: 'above', x: 200, y: 125 },
      { place: 'below', x: 200, y: 175 },
    ]);
    expect(
      placeAreaLabels([request(SMALL), request(larger, true)], SCREEN),
    ).toEqual([
      { place: 'above', x: 200, y: 125 },
      { place: 'below', x: 200, y: 175 },
    ]);
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
