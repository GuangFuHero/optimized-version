import { describe, expect, it } from 'vitest';

import { parseStatusCounts } from './status-counts';

describe('parseStatusCounts', () => {
  it('reads the zh-TW labels the endpoint returns back into status values', () => {
    expect(
      parseStatusCounts({
        x_values: ['營運中', '暫停營運', '永久關閉'],
        series: [{ name: '站點', values: [20, 5, 3] }],
      }),
    ).toEqual({ active: 20, temporarily_closed: 5, permanently_closed: 3 });
  });

  it('parses per-status counts from analytics data', () => {
    expect(
      parseStatusCounts({
        x_values: ['active', 'temporarily_closed', null],
        series: [{ name: 'n', values: [7, 2, 1] }],
      }),
    ).toEqual({ active: 7, temporarily_closed: 2, unknown: 1 });
  });

  it('returns no counts when the series is empty', () => {
    expect(parseStatusCounts({ x_values: ['active'], series: [] })).toEqual({
      active: 0,
    });
  });
});
