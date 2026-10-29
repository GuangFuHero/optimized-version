import { describe, expect, it } from 'vitest';

import {
  editableOutline,
  polygonAreaKm2,
  polygonSelfIntersects,
  toGeoJsonPolygon,
} from './polygon';

const SQUARE: [number, number][] = [
  [0, 0],
  [0, 1],
  [1, 1],
  [1, 0],
];
// A bow tie: the edges 0–1 and 2–3 cross.
const BOW_TIE: [number, number][] = [
  [0, 0],
  [1, 1],
  [0, 1],
  [1, 0],
];

describe('polygonSelfIntersects', () => {
  it('is false for a square and for a triangle', () => {
    expect(polygonSelfIntersects(SQUARE)).toBe(false);
    expect(polygonSelfIntersects(SQUARE.slice(0, 3))).toBe(false);
  });

  it('is false while the outline is still a line', () => {
    expect(polygonSelfIntersects(SQUARE.slice(0, 2))).toBe(false);
  });

  it('is true for a bow tie', () => {
    expect(polygonSelfIntersects(BOW_TIE)).toBe(true);
  });

  it('is true when the closing edge cuts across an earlier edge', () => {
    // The last corner sits so that the edge back to the first crosses the second edge.
    expect(
      polygonSelfIntersects([
        [0, 0],
        [0, 4],
        [4, 4],
        [-2, 2],
      ]),
    ).toBe(true);
  });

  it('is false for a concave outline that does not cross', () => {
    expect(
      polygonSelfIntersects([
        [0, 0],
        [0, 4],
        [2, 2],
        [4, 4],
        [4, 0],
      ]),
    ).toBe(false);
  });
});

describe('polygonAreaKm2', () => {
  it('is 0 for fewer than three corners', () => {
    expect(polygonAreaKm2(SQUARE.slice(0, 2))).toBe(0);
  });

  it('is about 110 × 111 km² for a one-degree square at the equator', () => {
    const area = polygonAreaKm2(SQUARE);

    expect(area).toBeGreaterThan(12000);
    expect(area).toBeLessThan(12700);
  });

  it('does not depend on the direction the corners go', () => {
    expect(polygonAreaKm2([...SQUARE].reverse())).toBeCloseTo(
      polygonAreaKm2(SQUARE),
    );
  });
});

describe('toGeoJsonPolygon', () => {
  it('writes [lng, lat] and closes the ring', () => {
    expect(
      toGeoJsonPolygon([
        [23.1, 121.2],
        [23.2, 121.3],
        [23.3, 121.1],
      ]),
    ).toEqual({
      type: 'Polygon',
      coordinates: [
        [
          [121.2, 23.1],
          [121.3, 23.2],
          [121.1, 23.3],
          [121.2, 23.1],
        ],
      ],
    });
  });
});

describe('editableOutline', () => {
  const ring: [number, number][] = [
    [0, 0],
    [0, 1],
    [1, 1],
    [1, 0],
  ];

  it('drops the closing point GeoJSON repeats', () => {
    expect(editableOutline([[[...ring, ring[0]]]])).toEqual(ring);
  });

  it('keeps an outline that is not closed as it is', () => {
    expect(editableOutline([[ring]])).toEqual(ring);
  });

  it('has none for a shape of several parts or with a hole', () => {
    expect(editableOutline([[ring], [ring]])).toBeNull();
    expect(editableOutline([[ring, ring]])).toBeNull();
    expect(editableOutline([])).toBeNull();
  });
});
