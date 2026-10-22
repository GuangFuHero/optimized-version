const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * How long ago the briefing was published, beside its time (prototype `vbAgo`): a volunteer decides
 * from this one line whether it is fresh enough to pack by. Null for a missing or broken time.
 */
export function briefingAge(
  iso: string | null | undefined,
  now: Date = new Date(),
): string | null {
  const time = iso ? new Date(iso).getTime() : Number.NaN;

  if (Number.isNaN(time)) {
    return null;
  }

  const ago = now.getTime() - time;

  if (ago < MINUTE) {
    return '剛剛';
  }
  if (ago < HOUR) {
    return `${Math.floor(ago / MINUTE)} 分鐘前`;
  }
  if (ago < DAY) {
    return `${Math.floor(ago / HOUR)} 小時前`;
  }
  return `${Math.floor(ago / DAY)} 天前`;
}
