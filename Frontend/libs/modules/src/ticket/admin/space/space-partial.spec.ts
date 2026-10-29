import { describe, expect, it } from 'vitest';

import { boardCountLine } from './board-count';
import {
  deleteKeepsText,
  SPACE_TICKETS_LIMIT,
  strandedHeading,
  ticketsCut,
} from './space-partial';

describe('a space whose tickets came back cut at the limit', () => {
  it('is cut once a full page comes back', () => {
    expect(SPACE_TICKETS_LIMIT).toBe(200);
    expect(ticketsCut(199)).toBe(false);
    expect(ticketsCut(200)).toBe(true);
  });

  it('says 至少 where the count is only what loaded', () => {
    expect(deleteKeepsText(3, false)).toBe(
      '這個空間會從列表與地圖上消失。底下 3 張任務單會保留，變回一般任務單（不再歸在這個空間），樓層與戶別照舊寫在單上。',
    );
    expect(deleteKeepsText(200, true)).toBe(
      '這個空間會從列表與地圖上消失。底下至少 200 張任務單會保留，變回一般任務單（不再歸在這個空間），樓層與戶別照舊寫在單上。',
    );
    expect(deleteKeepsText(0, false)).toBe(
      '這個空間會從列表與地圖上消失。它底下還沒有任何任務單。',
    );
  });

  it('counts stranded tickets the same way', () => {
    expect(strandedHeading(2, false)).toBe('有 2 張任務單在要拿掉的樓層');
    expect(strandedHeading(2, true)).toBe('至少有 2 張任務單在要拿掉的樓層');
  });
});

describe('the board count with more spaces than loaded', () => {
  it('marks the space count as a floor', () => {
    expect(boardCountLine(13, 200, true)).toBe('13 筆任務 · 200+ 個空間');
    expect(boardCountLine(13, 2, false)).toBe('13 筆任務 · 2 個空間');
  });
});
