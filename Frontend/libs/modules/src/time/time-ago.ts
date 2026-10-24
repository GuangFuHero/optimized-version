import { formatDistanceStrict } from 'date-fns';
import { zhTW } from 'date-fns/locale';

const MINUTE = 60_000;

/**
 * How long ago a moment was, beside its time: 「剛剛」, 「25 分鐘前」, 「3 小時前」, 「2 天前」 — whether
 * what it dates is fresh enough to go by. Null for a missing or broken time.
 *
 * In the largest whole unit, rounded down: 90 minutes is still 1 小時前, where date-fns would round
 * to 2 小時前 and make it older than it is.
 */
export function timeAgo(
  iso: string | null | undefined,
  now: Date = new Date(),
): string | null {
  const at = iso ? new Date(iso) : null;

  if (!at || Number.isNaN(at.getTime())) {
    return null;
  }

  // A clock a little behind the server's makes it the future, which date-fns reads as 「5 分鐘內」:
  // that is just now.
  if (now.getTime() - at.getTime() < MINUTE) {
    return '剛剛';
  }

  return formatDistanceStrict(at, now, {
    locale: zhTW,
    addSuffix: true,
    roundingMethod: 'floor',
  });
}
