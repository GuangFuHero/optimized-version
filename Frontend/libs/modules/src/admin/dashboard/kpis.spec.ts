import { describe, expect, it } from 'vitest';

import {
  addDays,
  applyFilterChange,
  dateRangeProblem,
  isValidDateRange,
  DASHBOARD_QUICK_RANGES,
  DASHBOARD_TIME_ZONES,
  formatKpiValue,
  kpiAvailability,
  localDateString,
  lookbackRange,
  rangeLengthDays,
  rangeQuickDays,
} from './kpis';

describe('localDateString', () => {
  it('takes the day in Taipei, not UTC: 17:00 UTC is already the next day there', () => {
    const now = new Date('2026-10-13T17:00:00Z');
    expect(localDateString(now, 'Asia/Taipei')).toBe('2026-10-14');
    expect(localDateString(now, 'UTC')).toBe('2026-10-13');
  });
});

describe('addDays', () => {
  it('crosses month and leap-day boundaries', () => {
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('lookbackRange', () => {
  const now = new Date('2026-10-14T04:00:00Z');

  it('ends today and counts today in the length: 近 7 天 is today and the six days before', () => {
    const range = lookbackRange(now, 'Asia/Taipei', 7);
    expect(range).toEqual({ start_date: '2026-10-08', end_date: '2026-10-14' });
    expect(rangeLengthDays(range)).toBe(7);
  });

  it("ends on the named zone's day, which is not UTC's", () => {
    const lateEvening = new Date('2026-10-13T17:00:00Z');
    expect(lookbackRange(lateEvening, 'Asia/Taipei', 30).end_date).toBe(
      '2026-10-14',
    );
    expect(lookbackRange(lateEvening, 'UTC', 30).end_date).toBe('2026-10-13');
  });
});

describe('rangeQuickDays', () => {
  it('names the shortcut a range is, and 自訂 (0) for every other span', () => {
    expect(
      rangeQuickDays({ start_date: '2026-10-08', end_date: '2026-10-14' }),
    ).toBe(7);
    expect(
      rangeQuickDays({ start_date: '2026-09-15', end_date: '2026-10-14' }),
    ).toBe(30);
    expect(
      rangeQuickDays({ start_date: '2026-10-01', end_date: '2026-10-14' }),
    ).toBe(0);
    // An open range is 自訂 too: neither shortcut describes it.
    expect(rangeQuickDays({})).toBe(0);
  });

  it('offers exactly the shortcuts it can name, 自訂 last', () => {
    expect(DASHBOARD_QUICK_RANGES.map((range) => range.id)).toEqual([7, 30, 0]);
  });
});

describe('the zone select', () => {
  it('offers the zones the backend accepts as tz, all of them IANA names', () => {
    expect(DASHBOARD_TIME_ZONES.map((zone) => zone.id)).toEqual([
      'Asia/Taipei',
      'UTC',
      'Asia/Tokyo',
    ]);
    for (const zone of DASHBOARD_TIME_ZONES) {
      expect(
        () => new Intl.DateTimeFormat('en-CA', { timeZone: zone.id }),
      ).not.toThrow();
    }
  });
});

describe('kpiAvailability', () => {
  const duplicate = { requires_date_range: true, max_range_days: 120 };

  it('lets a metric without a range rule through on any range', () => {
    expect(kpiAvailability({ requires_date_range: false }, {})).toEqual({
      kind: 'ready',
    });
    expect(kpiAvailability(undefined, {})).toEqual({ kind: 'ready' });
  });

  it('holds back duplicate_count on an open range, which the backend would 400', () => {
    expect(kpiAvailability(duplicate, {})).toEqual({
      kind: 'needs-range',
      maxDays: 120,
    });
  });

  it('holds it back past its maximum length, and allows exactly the maximum', () => {
    const end = '2026-10-14';
    expect(
      kpiAvailability(duplicate, {
        start_date: addDays(end, -120),
        end_date: end,
      }),
    ).toEqual({ kind: 'needs-range', maxDays: 120 });
    expect(
      kpiAvailability(duplicate, {
        start_date: addDays(end, -119),
        end_date: end,
      }),
    ).toEqual({ kind: 'ready' });
  });
});

describe('formatKpiValue', () => {
  it('prints a rate as given, since /value already scales it to 0–100', () => {
    expect(formatKpiValue(66.66666, '%')).toEqual({ value: '66.7', unit: '%' });
    expect(formatKpiValue(100, '%')).toEqual({ value: '100', unit: '%' });
  });

  it('groups counts and keeps the catalog unit', () => {
    expect(formatKpiValue(12345, '件')).toEqual({
      value: '12,345',
      unit: '件',
    });
    expect(formatKpiValue(0, '站')).toEqual({ value: '0', unit: '站' });
  });
});

describe('rangeLengthDays', () => {
  it('counts both ends, and reports an open range as unknown rather than 0', () => {
    expect(
      rangeLengthDays({ start_date: '2026-10-08', end_date: '2026-10-14' }),
    ).toBe(7);
    expect(rangeLengthDays({ end_date: '2026-10-14' })).toBeNull();
    expect(rangeLengthDays({})).toBeNull();
  });
});

describe('isValidDateRange', () => {
  it('holds incomplete, impossible and reversed edits instead of querying them', () => {
    for (const range of [
      {},
      { start_date: '2026-10-01' },
      { start_date: '2026-10-01', end_date: '' },
      { start_date: '2026-02-30', end_date: '2026-03-01' },
      { start_date: '2026-10-20', end_date: '2026-10-01' },
      { start_date: '0000-01-01', end_date: 'invalid' },
    ])
      expect(isValidDateRange(range)).toBe(false);
  });
  it('accepts same-day and leap-year ranges', () => {
    expect(
      isValidDateRange({ start_date: '2026-10-01', end_date: '2026-10-01' }),
    ).toBe(true);
    expect(
      isValidDateRange({ start_date: '2028-02-29', end_date: '2028-03-01' }),
    ).toBe(true);
  });
});

describe('applyFilterChange', () => {
  const applied = {
    range: { start_date: '2026-10-01', end_date: '2026-10-30' },
    granularity: 'day',
    timeZone: 'Asia/Taipei',
  };

  it('takes a valid edit whole', () => {
    const next = {
      ...applied,
      range: { start_date: '2026-10-05', end_date: '2026-10-30' },
    };
    expect(applyFilterChange(applied, next)).toBe(next);
  });

  it('keeps the last valid range but applies the bucket size and the zone', () => {
    const next = {
      range: { start_date: '2026-11-01', end_date: '2026-10-30' },
      granularity: 'week',
      timeZone: 'UTC',
    };
    expect(applyFilterChange(applied, next)).toEqual({
      range: applied.range,
      granularity: 'week',
      timeZone: 'UTC',
    });
  });
});

describe('dateRangeProblem', () => {
  const applied = { start_date: '2026-10-01', end_date: '2026-10-30' };

  it('says nothing about a range the charts use', () => {
    expect(dateRangeProblem(applied, applied)).toBeNull();
  });

  it('names what is wrong and which period is still shown', () => {
    expect(dateRangeProblem({ start_date: '2026-10-01' }, applied)).toBe(
      '起訖日期還沒選完，圖表仍顯示 2026-10-01 → 2026-10-30。',
    );
    expect(
      dateRangeProblem(
        { start_date: '2026-10-20', end_date: '2026-10-01' },
        applied,
      ),
    ).toBe('起日晚於訖日，圖表仍顯示 2026-10-01 → 2026-10-30。');
    expect(
      dateRangeProblem(
        { start_date: '2026-02-30', end_date: '2026-03-01' },
        applied,
      ),
    ).toMatch(/^日期無效/);
  });
});
