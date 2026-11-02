import { describe, expect, it } from 'vitest';

import { eventDayNumber } from './event-day';

describe('eventDayNumber', () => {
  const now = new Date('2026-10-27T09:00:00+08:00');

  it('counts the start day as day 1, by calendar day in Taiwan', () => {
    expect(eventDayNumber('2026-10-27T08:00:00+08:00', now)).toBe(1);
    expect(eventDayNumber('2026-10-26T23:59:00+08:00', now)).toBe(2);
    expect(eventDayNumber('2026-10-04T06:30:00+08:00', now)).toBe(24);
  });

  it('counts Taiwan days whatever zone the device is in', () => {
    // 10-27 07:00 in Taiwan is still 10-26 in UTC: day 1, not 2.
    expect(eventDayNumber('2026-10-26T23:00:00Z', now)).toBe(1);
    // 10-26 23:30 in Taiwan is already 10-27 in Melbourne: day 2, not 1.
    expect(eventDayNumber('2026-10-26T15:30:00Z', now)).toBe(2);
  });

  it('has no day before the disaster starts, or when the start is unset or unreadable', () => {
    expect(eventDayNumber('2026-10-28T00:00:00+08:00', now)).toBeNull();
    expect(eventDayNumber(null, now)).toBeNull();
    expect(eventDayNumber(undefined, now)).toBeNull();
    expect(eventDayNumber('not a date', now)).toBeNull();
  });
});
