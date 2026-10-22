import { describe, expect, it } from 'vitest';

import { briefingAge } from './briefing-age';

const NOW = new Date('2026-10-22T08:00:00Z');

describe('briefingAge', () => {
  it('says how long ago, in the largest whole unit', () => {
    expect(briefingAge('2026-10-22T07:59:30Z', NOW)).toBe('剛剛');
    expect(briefingAge('2026-10-22T07:59:00Z', NOW)).toBe('1 分鐘前');
    expect(briefingAge('2026-10-22T07:01:00Z', NOW)).toBe('59 分鐘前');
    expect(briefingAge('2026-10-22T06:00:00Z', NOW)).toBe('2 小時前');
    expect(briefingAge('2026-10-21T08:00:01Z', NOW)).toBe('23 小時前');
    expect(briefingAge('2026-10-19T08:00:00Z', NOW)).toBe('3 天前');
  });

  it('calls a time a little ahead of this device’s clock 剛剛', () => {
    expect(briefingAge('2026-10-22T08:00:40Z', NOW)).toBe('剛剛');
  });

  it('has nothing to say for a missing or broken time', () => {
    expect(briefingAge(null, NOW)).toBeNull();
    expect(briefingAge('not a time', NOW)).toBeNull();
  });
});
