import { describe, expect, it } from 'vitest';

import { readProgress } from './index';

describe('readProgress', () => {
  it('reads the share taken, as a number and a length', () => {
    expect(readProgress(3, 8)).toEqual({
      hasMax: true,
      done: false,
      percent: 38,
      text: '3/8',
    });
  });

  it('is done once every place is taken, and says it is full', () => {
    expect(readProgress(4, 4)).toMatchObject({
      done: true,
      percent: 100,
      text: '已滿 4/4',
    });
  });

  it('is not done when told so, though every place is taken (PRG-102)', () => {
    expect(readProgress(3, 3, false)).toMatchObject({
      done: false,
      percent: 100,
      text: '3/3',
    });
  });

  it('draws no bar without a total, and says how many there are (PRG-104)', () => {
    expect(readProgress(2)).toEqual({
      hasMax: false,
      done: false,
      percent: 0,
      text: '已有 2 人',
    });
    expect(readProgress(2, 0).hasMax).toBe(false);
  });

  it('keeps the bar to its full length when more have come than asked for', () => {
    expect(readProgress(5, 4).percent).toBe(100);
  });
});
