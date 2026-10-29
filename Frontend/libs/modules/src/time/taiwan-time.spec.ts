import { describe, expect, it } from 'vitest';

import {
  formatTaiwanTime,
  fromTaiwanDateTimeLocal,
  taiwanCalendarDay,
  toTaiwanDateTimeLocal,
} from './taiwan-time';

describe('formatTaiwanTime', () => {
  it('reads a moment as month, day and minute in Taiwan time, without the year', () => {
    expect(formatTaiwanTime('2026-09-30T06:05:00Z')).toBe('9/30 14:05');
  });

  it('turns the date over at Taiwan midnight, whatever zone the device is in', () => {
    expect(formatTaiwanTime('2026-09-30T16:30:00Z')).toBe('10/1 00:30');
  });

  it('reads nothing into a missing or broken time', () => {
    expect(formatTaiwanTime(undefined)).toBeNull();
    expect(formatTaiwanTime('not a time')).toBeNull();
  });
});

describe('a datetime-local field in Taiwan time', () => {
  it('shows a stored moment as Taiwan time, whatever zone the device is in', () => {
    expect(toTaiwanDateTimeLocal('2026-10-03T22:30:00Z')).toBe(
      '2026-10-04T06:30',
    );
    expect(toTaiwanDateTimeLocal('2026-10-04T06:30:00.123456+08:00')).toBe(
      '2026-10-04T06:30',
    );
  });

  it('reads what is typed as Taiwan time', () => {
    expect(fromTaiwanDateTimeLocal('2026-10-04T06:30')?.toISOString()).toBe(
      '2026-10-03T22:30:00.000Z',
    );
  });

  it('leaves the field empty for a missing or broken time, and reads nothing from one', () => {
    expect(toTaiwanDateTimeLocal(null)).toBe('');
    expect(toTaiwanDateTimeLocal(undefined)).toBe('');
    expect(toTaiwanDateTimeLocal('not a date')).toBe('');
    expect(fromTaiwanDateTimeLocal('')).toBeNull();
    expect(fromTaiwanDateTimeLocal('2026-10-04')).toBeNull();
    expect(fromTaiwanDateTimeLocal('2026-10-04T06:30Z')).toBeNull();
  });
});

describe('taiwanCalendarDay', () => {
  it("turns the day over at Taiwan midnight, not the device's", () => {
    const day = (iso: string) => taiwanCalendarDay(new Date(iso));

    expect(day('2026-10-26T15:59:00Z')).toBe(day('2026-10-26T00:00:00+08:00'));
    expect(day('2026-10-26T16:00:00Z')).toBe(
      day('2026-10-26T00:00:00+08:00') + 1,
    );
  });
});
