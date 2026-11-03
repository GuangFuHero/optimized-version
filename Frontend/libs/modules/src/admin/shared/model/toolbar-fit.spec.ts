import { describe, expect, it } from 'vitest';

import { fitsOneRow, toolbarLayout } from './toolbar-fit';

describe('fitsOneRow', () => {
  it('counts a gap between each two items', () => {
    expect(fitsOneRow([100, 140, 60], 8, 316)).toBe(true);
    expect(fitsOneRow([100, 140, 60], 8, 315.5)).toBe(false);
  });

  it('counts no gap around a lone item', () => {
    expect(fitsOneRow([200], 8, 200)).toBe(true);
    expect(fitsOneRow([], 8, 0)).toBe(true);
  });
});

describe('toolbarLayout', () => {
  // Search 200, two buttons 100 and 120 (新增 ▾ last), count 80, gap 8.
  const others = [200, 100, 120];

  it('keeps the count inline when everything fits', () => {
    expect(toolbarLayout(others, 80, 8, 524)).toBe('inline');
  });

  it('drops the count alone when only the buttons fit', () => {
    expect(toolbarLayout(others, 80, 8, 523)).toBe('below');
    expect(toolbarLayout(others, 80, 8, 436)).toBe('below');
  });

  it('sends the count down with the last button when the buttons do not fit', () => {
    expect(toolbarLayout(others, 80, 8, 435)).toBe('withLast');
  });
});
