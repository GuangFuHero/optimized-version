import { describe, expect, it } from 'vitest';

import { countDetailOpenings } from './detail-openings';

describe('countDetailOpenings', () => {
  it('counts each opening', () => {
    const opened = countDetailOpenings({ open: false, openings: 0 }, true);

    expect(opened).toEqual({ open: true, openings: 1 });
    expect(
      countDetailOpenings(countDetailOpenings(opened, false), true),
    ).toEqual({
      open: true,
      openings: 2,
    });
  });

  it('keeps the count when it closes', () => {
    expect(countDetailOpenings({ open: true, openings: 3 }, false)).toEqual({
      open: false,
      openings: 3,
    });
  });

  it('leaves the state as it is when nothing changed', () => {
    const open = { open: true, openings: 1 };
    const closed = { open: false, openings: 1 };

    expect(countDetailOpenings(open, true)).toBe(open);
    expect(countDetailOpenings(closed, false)).toBe(closed);
  });
});
