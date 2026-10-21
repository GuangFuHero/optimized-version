import { describe, expect, it } from 'vitest';

import {
  getOperationalStatusMeta,
  OPERATIONAL_STATUS_OPTIONS,
  parseStatusCounts,
} from './status';

describe('getOperationalStatusMeta', () => {
  it('labels every backend value', () => {
    expect(OPERATIONAL_STATUS_OPTIONS.map((o) => o.value)).toEqual([
      'active',
      'temporarily_closed',
      'permanently_closed',
    ]);
    expect(getOperationalStatusMeta('active')).toMatchObject({
      label: '開設中',
      tone: 'success',
    });
  });

  it('falls back to the raw value for an unknown status', () => {
    expect(getOperationalStatusMeta('weird')).toEqual({
      value: 'weird',
      label: 'weird',
      tone: 'neutral',
    });
    expect(getOperationalStatusMeta(null)).toEqual({
      value: '',
      label: '—',
      tone: 'neutral',
    });
  });
});

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
