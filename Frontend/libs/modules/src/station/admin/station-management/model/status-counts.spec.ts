import { describe, expect, it } from 'vitest';

import { parseStatusCounts } from './status-counts';

describe('parseStatusCounts', () => {
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
