import { describe, expect, it } from 'vitest';

import { fitsOneRow } from './toolbar-fit';

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
