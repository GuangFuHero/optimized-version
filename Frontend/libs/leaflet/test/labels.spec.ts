// SPDX-License-Identifier: GPL-3.0-only
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  placeLabels,
  type ScreenBox,
  type LabelRequest,
} from '../src/labels.ts';

describe('placeLabels', () => {
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
  const request = (area: ScreenBox, priority = 0): LabelRequest => ({
    priority,
    area,
    label: LABEL,
  });
  const SMALL = box(190, 140, 210, 160);

  it('puts the label in the middle of an area with room for it', () => {
    expect(placeLabels([request(box(50, 50, 350, 250))], SCREEN)).toEqual([
      { place: 'center', x: 200, y: 150 },
    ]);
  });

  it('moves it off an obstacle to the nearest clear point inside the area', () => {
    expect(
      placeLabels([request(box(50, 50, 350, 250))], {
        ...SCREEN,
        obstacles: [box(180, 140, 220, 160)],
      }),
    ).toEqual([{ place: 'center', x: 200, y: 109.5 }]);
  });

  it('looks only at the part of an area on screen, when it extends beyond the viewport', () => {
    expect(
      placeLabels([request(box(-1000, -1000, 1200, 1000))], SCREEN),
    ).toEqual([{ place: 'center', x: 200, y: 150 }]);
  });

  it('hangs it below an area too small for it, then above, then to its right', () => {
    expect(placeLabels([request(SMALL)], SCREEN)).toEqual([
      { place: 'below', x: 200, y: 175 },
    ]);
    expect(
      placeLabels([request(SMALL)], {
        ...SCREEN,
        obstacles: [box(190, 170, 210, 180)],
      }),
    ).toEqual([{ place: 'above', x: 200, y: 125 }]);
    expect(
      placeLabels([request(SMALL)], {
        ...SCREEN,
        obstacles: [box(190, 170, 210, 180), box(190, 120, 210, 130)],
      }),
    ).toEqual([{ place: 'right', x: 264, y: 150 }]);
  });

  it('leaves the label out when nowhere is clear', () => {
    expect(
      placeLabels([request(SMALL)], { ...SCREEN, isCovered: () => true }),
    ).toEqual([{ place: 'hidden' }]);
  });

  it('keeps it on screen and off what floats over the map', () => {
    expect(placeLabels([request(box(190, 280, 210, 295))], SCREEN)).toEqual([
      { place: 'above', x: 200, y: 265 },
    ]);
    expect(
      placeLabels([request(box(50, 0, 350, 300))], {
        ...SCREEN,
        isCovered: (label) => label.left < 190,
      }),
    ).toEqual([{ place: 'center', x: 246, y: 150 }]);
  });

  it('leaves out the label of an area off screen', () => {
    expect(placeLabels([request(box(500, 50, 600, 100))], SCREEN)).toEqual([
      { place: 'offscreen' },
    ]);
  });

  it('places high-priority labels and smaller areas first without overlap', () => {
    const larger = box(185, 140, 215, 160);

    expect(placeLabels([request(larger), request(SMALL)], SCREEN)).toEqual([
      { place: 'above', x: 200, y: 125 },
      { place: 'below', x: 200, y: 175 },
    ]);
    expect(placeLabels([request(SMALL), request(larger, 1)], SCREEN)).toEqual([
      { place: 'above', x: 200, y: 125 },
      { place: 'below', x: 200, y: 175 },
    ]);
  });
});
