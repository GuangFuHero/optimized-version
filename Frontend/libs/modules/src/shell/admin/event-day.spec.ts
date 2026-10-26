import { describe, expect, it } from 'vitest';

import { eventDayNumber } from './event-day';

describe('eventDayNumber', () => {
  const now = new Date(2026, 9, 27, 9, 0);

  it('counts the start day as day 1, by calendar day', () => {
    expect(eventDayNumber(new Date(2026, 9, 27, 8, 0).toISOString(), now)).toBe(
      1,
    );
    expect(
      eventDayNumber(new Date(2026, 9, 26, 23, 59).toISOString(), now),
    ).toBe(2);
    expect(eventDayNumber(new Date(2026, 9, 4, 6, 30).toISOString(), now)).toBe(
      24,
    );
  });

  it('has no day before the disaster starts, or when the start is unset or unreadable', () => {
    expect(eventDayNumber(new Date(2026, 9, 28).toISOString(), now)).toBeNull();
    expect(eventDayNumber(null, now)).toBeNull();
    expect(eventDayNumber(undefined, now)).toBeNull();
    expect(eventDayNumber('not a date', now)).toBeNull();
  });
});
