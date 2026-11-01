import { describe, expect, it } from 'vitest';

import {
  floorLabelsFor,
  floorSummary,
  matchFloor,
  orderFloors,
} from './floors';

describe('orderFloors', () => {
  it('puts basements deepest first and RF last, as the designer orders them', () => {
    expect(orderFloors(['RF', '2F', '1F', 'B1', 'B2'])).toEqual([
      'B2',
      'B1',
      '1F',
      '2F',
      'RF',
    ]);
  });

  it('orders 10F after 9F, not after 1F', () => {
    expect(orderFloors(['10F', '9F', '1F'])).toEqual(['1F', '9F', '10F']);
  });
});

describe('floorLabelsFor', () => {
  it('derives every floor plus RF', () => {
    expect(floorLabelsFor(3, 1)).toEqual(['B1', '1F', '2F', '3F', 'RF']);
  });

  it('has no basements at 0', () => {
    expect(floorLabelsFor(1, 0)).toEqual(['1F', 'RF']);
  });
});

describe('matchFloor', () => {
  const labels = floorLabelsFor(5, 1);

  it.each([
    ['3', '3F'],
    ['3F', '3F'],
    ['3樓', '3F'],
    [' 3 F ', '3F'],
    ['３樓', '3F'],
    ['3f', '3F'],
    ['B1', 'B1'],
    ['b1', 'B1'],
    ['地下1', 'B1'],
    ['地下1樓', 'B1'],
    ['頂樓', 'RF'],
    ['屋頂', 'RF'],
    ['R', 'RF'],
    ['RF', 'RF'],
  ])('reads %s as %s', (raw, floor) => {
    expect(matchFloor(raw, labels).floor).toBe(floor);
  });

  it('keeps a floor the building lacks as raw text', () => {
    expect(matchFloor('7F', labels)).toEqual({ floor: null, raw: '7F' });
  });

  it('treats blank and missing as unknown', () => {
    expect(matchFloor('  ', labels)).toEqual({ floor: null, raw: '' });
    expect(matchFloor(null, labels)).toEqual({ floor: null, raw: '' });
  });

  it('does not guess at free text', () => {
    expect(matchFloor('早餐店', labels)).toEqual({
      floor: null,
      raw: '早餐店',
    });
  });
});

describe('floorSummary', () => {
  it('compresses floor runs', () => {
    expect(floorSummary(floorLabelsFor(12, 1))).toBe(
      'B1、1F～12F、RF（共 14 層）',
    );
  });

  it('names a single floor once', () => {
    expect(floorSummary(['1F', 'RF'])).toBe('1F、RF（共 2 層）');
  });

  it('runs basements from deepest to B1', () => {
    expect(floorSummary(floorLabelsFor(2, 3))).toBe(
      'B3～B1、1F～2F、RF（共 6 層）',
    );
  });
});
