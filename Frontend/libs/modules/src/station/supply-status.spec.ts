import { describe, expect, it } from 'vitest';

import { describeSupplyStatus } from './supply-status';

const NOW = new Date('2026-10-20T06:00:00Z');
const before = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('describeSupplyStatus', () => {
  it('says nothing for a station without a line', () => {
    expect(describeSupplyStatus(null, null, NOW)).toBeNull();
    expect(describeSupplyStatus('   ', before(HOUR), NOW)).toBeNull();
  });

  it('says how long ago the line changed', () => {
    expect(describeSupplyStatus('飲用水見底', before(20_000), NOW)).toEqual({
      text: '飲用水見底',
      updated: '剛剛更新',
    });
    expect(
      describeSupplyStatus('飲用水見底', before(25 * MINUTE), NOW)?.updated,
    ).toBe('25 分鐘前更新');
    expect(
      describeSupplyStatus('飲用水見底', before(3 * HOUR + 59 * MINUTE), NOW)
        ?.updated,
    ).toBe('3 小時前更新');
    expect(
      describeSupplyStatus('飲用水見底', before(2 * DAY), NOW)?.updated,
    ).toBe('2 天前更新');
  });

  it('gives the date on Taiwan’s clock once it is over a week old', () => {
    // 2026-10-09 20:00 UTC is already 10-10 in Taipei.
    expect(
      describeSupplyStatus('飲用水見底', '2026-10-09T20:00:00Z', NOW)?.updated,
    ).toBe('10/10 更新');
  });

  it('reads a time ahead of the clock as just now, and leaves out one it cannot read', () => {
    expect(
      describeSupplyStatus('飲用水見底', '2026-10-20T06:05:00Z', NOW)?.updated,
    ).toBe('剛剛更新');
    expect(describeSupplyStatus(' 飲用水見底 ', 'yesterday', NOW)).toEqual({
      text: '飲用水見底',
      updated: null,
    });
    expect(describeSupplyStatus('飲用水見底', null, NOW)?.updated).toBeNull();
  });
});
