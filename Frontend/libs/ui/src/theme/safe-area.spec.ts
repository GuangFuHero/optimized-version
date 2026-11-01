import { describe, expect, it } from 'vitest';

import { safeAreaBottom } from './safe-area';

describe('safeAreaBottom', () => {
  it('adds the home indicator to the space, falling back to none', () => {
    expect(safeAreaBottom(12)).toBe(
      'calc(12px + env(safe-area-inset-bottom, 0px))',
    );
    expect(safeAreaBottom(84)).toBe(
      'calc(84px + env(safe-area-inset-bottom, 0px))',
    );
  });

  it('is the home indicator alone with no space of its own', () => {
    expect(safeAreaBottom(0)).toBe('env(safe-area-inset-bottom, 0px)');
  });
});
