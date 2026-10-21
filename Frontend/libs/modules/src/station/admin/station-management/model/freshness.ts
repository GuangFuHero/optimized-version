export type FreshnessLevel = 'fresh' | 'stale' | 'expired' | 'unknown';

/** Untouched for a day reads as stale, for three days as expired. Never shown in danger red. */
export const STALE_MINUTES = 24 * 60;
export const EXPIRED_MINUTES = 72 * 60;

export function getFreshness(
  updatedAt: string | null | undefined,
  now: Date,
): { level: FreshnessLevel; relative: string; minutes: number | null } {
  const time = updatedAt ? Date.parse(updatedAt) : Number.NaN;
  if (Number.isNaN(time)) {
    return { level: 'unknown', relative: '—', minutes: null };
  }
  const minutes = Math.max(0, Math.floor((now.getTime() - time) / 60_000));
  const level: FreshnessLevel =
    minutes >= EXPIRED_MINUTES
      ? 'expired'
      : minutes >= STALE_MINUTES
        ? 'stale'
        : 'fresh';
  return { level, relative: formatRelative(minutes), minutes };
}

function formatRelative(minutes: number): string {
  if (minutes < 1) return '剛剛';
  if (minutes < 60) return `${minutes} 分前`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} 小時前`;
  return `${Math.floor(minutes / (24 * 60))} 天前`;
}
