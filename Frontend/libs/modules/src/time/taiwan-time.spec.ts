import { describe, expect, it } from 'vitest';

import {
  formatTaiwanDateTime,
  formatTaiwanTime,
  taiwanDateParts,
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

describe('formatTaiwanDateTime', () => {
  it('reads a moment with its year, zero-padded, on a 24-hour clock', () => {
    expect(formatTaiwanDateTime('2026-09-30T06:05:00Z')).toBe(
      '2026/09/30 14:05',
    );
  });

  it('turns the year over at Taiwan midnight', () => {
    expect(formatTaiwanDateTime('2026-12-31T16:30:00Z')).toBe(
      '2027/01/01 00:30',
    );
  });

  it('reads nothing into a missing or broken time', () => {
    expect(formatTaiwanDateTime(null)).toBeNull();
    expect(formatTaiwanDateTime('not a time')).toBeNull();
  });
});

describe('taiwanDateParts', () => {
  it('gives each part as padded digits in Taiwan time', () => {
    expect(taiwanDateParts(new Date('2026-01-04T17:03:00Z'))).toEqual({
      year: '2026',
      month: '01',
      day: '05',
      hour: '01',
      minute: '03',
    });
  });
});
