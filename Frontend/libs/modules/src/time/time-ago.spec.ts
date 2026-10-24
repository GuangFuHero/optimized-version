import { describe, expect, it } from 'vitest';

import { timeAgo } from './time-ago';

const NOW = new Date('2026-10-22T08:00:00Z');

describe('timeAgo', () => {
  it('says how long ago, in the largest whole unit', () => {
    expect(timeAgo('2026-10-22T07:59:30Z', NOW)).toBe('剛剛');
    expect(timeAgo('2026-10-22T07:59:00Z', NOW)).toBe('1 分鐘前');
    expect(timeAgo('2026-10-22T07:01:00Z', NOW)).toBe('59 分鐘前');
    expect(timeAgo('2026-10-22T06:00:00Z', NOW)).toBe('2 小時前');
    expect(timeAgo('2026-10-21T08:00:01Z', NOW)).toBe('23 小時前');
    expect(timeAgo('2026-10-19T08:00:00Z', NOW)).toBe('3 天前');
  });

  it('rounds down, never making a moment older than it is', () => {
    expect(timeAgo('2026-10-22T06:30:00Z', NOW)).toBe('1 小時前');
    expect(timeAgo('2026-10-20T20:00:00Z', NOW)).toBe('1 天前');
  });

  it('goes on to months and years past a month', () => {
    expect(timeAgo('2026-09-23T08:00:00Z', NOW)).toBe('29 天前');
    expect(timeAgo('2026-09-07T08:00:00Z', NOW)).toBe('1 個月前');
    expect(timeAgo('2025-09-07T08:00:00Z', NOW)).toBe('1 年前');
  });

  it('calls a time ahead of this device’s clock 剛剛', () => {
    expect(timeAgo('2026-10-22T08:00:40Z', NOW)).toBe('剛剛');
    expect(timeAgo('2026-10-22T08:05:00Z', NOW)).toBe('剛剛');
  });

  it('has nothing to say for a missing or broken time', () => {
    expect(timeAgo(null, NOW)).toBeNull();
    expect(timeAgo(undefined, NOW)).toBeNull();
    expect(timeAgo('not a time', NOW)).toBeNull();
  });
});
