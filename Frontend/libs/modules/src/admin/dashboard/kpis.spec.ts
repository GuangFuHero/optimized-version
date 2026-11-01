import { describe, expect, it } from 'vitest';

import {
  addDays,
  applyFilterChange,
  chartAvailability,
  dateRangeProblem,
  kpiQueryRange,
  rangeAsOfCaption,
  VOLUNTEER_KPIS,
  volunteerGapLine,
  isValidDateRange,
  DASHBOARD_QUICK_RANGES,
  DASHBOARD_TIME_ZONES,
  formatKpiValue,
  kpiAvailability,
  localDateString,
  lookbackRange,
  rangeLengthDays,
  quickRangeDates,
  rangeCreatedCaption,
  rangeQuickRange,
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

describe('the 看多久 shortcuts', () => {
  const today = '2026-10-26';

  it('offers the five ranges product set on Oct 25, 自定義 last', () => {
    expect(DASHBOARD_QUICK_RANGES.map((range) => range.label)).toEqual([
      '今日',
      '事件發生到今日',
      '近一週',
      '近 30 天',
      '自定義',
    ]);
  });

  it('turns each shortcut into dates ending today', () => {
    expect(quickRangeDates('today', today)).toEqual({
      start_date: today,
      end_date: today,
    });
    // No start: the backend counts from the first ticket.
    expect(quickRangeDates('all', today)).toEqual({ end_date: today });
    expect(quickRangeDates(7, today)).toEqual({
      start_date: '2026-10-20',
      end_date: today,
    });
    expect(quickRangeDates(30, today)).toEqual({
      start_date: '2026-09-27',
      end_date: today,
    });
    expect(quickRangeDates('custom', today)).toBeNull();
  });

  it('names the shortcut each set of dates is, round trip', () => {
    for (const { id } of DASHBOARD_QUICK_RANGES) {
      const dates = quickRangeDates(id, today);
      if (dates) expect(rangeQuickRange(dates, today)).toBe(id);
    }
  });

  it('calls a range that does not end today 自定義, whatever its length', () => {
    expect(
      rangeQuickRange(
        { start_date: '2026-10-08', end_date: '2026-10-14' },
        today,
      ),
    ).toBe('custom');
    expect(
      rangeQuickRange(
        { start_date: '2026-10-14', end_date: '2026-10-14' },
        today,
      ),
    ).toBe('custom');
    expect(rangeQuickRange({ end_date: '2026-10-14' }, today)).toBe('custom');
    expect(
      rangeQuickRange({ start_date: '2026-10-13', end_date: today }, today),
    ).toBe('custom');
  });
});

describe('rangeCreatedCaption', () => {
  const today = '2026-10-26';

  it('says which tickets a card counts, by when they were created', () => {
    expect(
      rangeCreatedCaption({ start_date: today, end_date: today }, today),
    ).toBe('今日建立');
    expect(rangeCreatedCaption({ end_date: today }, today)).toBe(
      '事件發生至今建立',
    );
    expect(
      rangeCreatedCaption({ start_date: '2026-10-20', end_date: today }, today),
    ).toBe('近一週建立');
    expect(
      rangeCreatedCaption({ start_date: '2026-09-27', end_date: today }, today),
    ).toBe('近 30 天建立');
  });

  it('writes out a custom range', () => {
    expect(
      rangeCreatedCaption(
        { start_date: '2026-10-01', end_date: '2026-10-20' },
        today,
      ),
    ).toBe('10/01–10/20 建立');
    expect(rangeCreatedCaption({ end_date: '2026-10-20' }, today)).toBe(
      '10/20 以前建立',
    );
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
      { start_date: '', end_date: '2026-10-01' },
      { start_date: '2026-10-01', end_date: '' },
      { start_date: '2026-02-30', end_date: '2026-03-01' },
      { start_date: '2026-10-20', end_date: '2026-10-01' },
      { start_date: '0000-01-01', end_date: 'invalid' },
    ])
      expect(isValidDateRange(range)).toBe(false);
  });
  it('accepts an open start, which is 事件發生到今日', () => {
    expect(isValidDateRange({ end_date: '2026-10-01' })).toBe(true);
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
      '訖日還沒選，圖表仍顯示 2026-10-01 → 2026-10-30。',
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

describe('the volunteer cards', () => {
  const today = '2026-11-01';
  const range = { start_date: '2026-10-03', end_date: today };

  it('are the three running totals, in the design order, each asked for at the end date only', () => {
    expect(VOLUNTEER_KPIS.map((kpi) => kpi.metric)).toEqual([
      'volunteers_needed',
      'volunteers_matched',
      'volunteer_gap',
    ]);
    for (const kpi of VOLUNTEER_KPIS) {
      expect(kpiQueryRange(kpi, range)).toEqual({ end_date: today });
    }
    expect(kpiQueryRange({}, range)).toEqual(range);
  });

  it('say which day they stand at: today, or the end date of a past range', () => {
    expect(rangeAsOfCaption(range, today)).toBe('截至今日');
    expect(rangeAsOfCaption({ end_date: '2026-10-31' }, today)).toBe(
      '截至 10/31',
    );
  });

  it('say nothing is missing only when the gap is exactly zero', () => {
    expect(volunteerGapLine(0)).toBe('目前沒有缺人的需求');
    expect(volunteerGapLine(3)).toBeNull();
    expect(volunteerGapLine(undefined)).toBeNull();
  });
});

describe('chartAvailability', () => {
  const trend = { requires_date_range: false, max_range_days: 366 };

  it("caps a daily trend at the catalog's days, and lets an open range through", () => {
    expect(
      chartAvailability(
        trend,
        { start_date: '2025-01-01', end_date: '2026-11-01' },
        'date',
      ),
    ).toEqual({ kind: 'needs-range', maxDays: 366 });
    expect(
      chartAvailability(trend, { end_date: '2026-11-01' }, 'date'),
    ).toEqual({ kind: 'ready' });
  });

  it('leaves the other groupings to kpiAvailability: they read one instant', () => {
    expect(
      chartAvailability(
        trend,
        { start_date: '2025-01-01', end_date: '2026-11-01' },
        'category',
      ),
    ).toEqual({ kind: 'ready' });
  });
});
