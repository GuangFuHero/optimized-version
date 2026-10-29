import { taiwanCalendarDay } from '../../time/taiwan-time';

/**
 * 第 N 天 of the disaster, the start day being day 1, counted in Taiwan calendar days whatever the device's
 * zone (HC, #153). Null before it starts, or when the start is unset or unreadable. The sidebar and the
 * settings page both count with this, so 「今天是第 N 天」 on one never disagrees with the other.
 */
export function eventDayNumber(
  startedAt: string | null | undefined,
  now: Date,
): number | null {
  const start = startedAt ? new Date(startedAt) : null;
  if (!start || Number.isNaN(start.getTime())) return null;
  const elapsed = taiwanCalendarDay(now) - taiwanCalendarDay(start);
  return elapsed >= 0 ? elapsed + 1 : null;
}
