import { describe, expect, it } from 'vitest';

import { boardCountLine } from './board-count';

describe('boardCountLine', () => {
  it('counts the spaces after the tickets', () => {
    expect(boardCountLine(13, 1)).toBe('13 筆任務 · 1 個空間');
    expect(boardCountLine(0, 2)).toBe('0 筆任務 · 2 個空間');
  });

  it('says nothing of spaces when none show', () => {
    expect(boardCountLine(13, 0)).toBe('13 筆任務');
  });
});
