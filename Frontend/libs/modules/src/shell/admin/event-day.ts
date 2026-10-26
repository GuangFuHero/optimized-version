import { differenceInCalendarDays, parseISO } from 'date-fns';

/**
 * 第 N 天 of the disaster, the start day being day 1, counted in calendar days in the browser's zone.
 * Null before it starts, or when the start is unset or unreadable. The sidebar and the settings page
 * both count with this, so 「今天是第 N 天」 on one never disagrees with the other.
 */
export function eventDayNumber(
  startedAt: string | null | undefined,
  now: Date,
): number | null {
  if (!startedAt) return null;
  const elapsed = differenceInCalendarDays(now, parseISO(startedAt));
  return Number.isFinite(elapsed) && elapsed >= 0 ? elapsed + 1 : null;
}
