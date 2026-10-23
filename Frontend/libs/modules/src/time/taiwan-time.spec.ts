import { describe, expect, it } from 'vitest';

import { formatTaiwanTime } from './taiwan-time';

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
