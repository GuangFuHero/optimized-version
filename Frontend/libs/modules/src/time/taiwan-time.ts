// Numbers only: `en-US` spells each part as digits, where `zh-TW` would add 上午／下午.
const TAIWAN_TIME_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Taipei',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * A moment as 「9/30 14:05」, in Taiwan time whatever the device's zone, without the year — for what
 * is still going on: claims to keep, requests filed, the briefing to pack by. Null for a missing or
 * broken time.
 */
export function formatTaiwanTime(
  iso: string | null | undefined,
): string | null {
  const time = iso ? new Date(iso) : null;

  if (!time || Number.isNaN(time.getTime())) {
    return null;
  }

  const parts = Object.fromEntries(
    TAIWAN_TIME_FORMAT.formatToParts(time).map((part) => [
      part.type,
      part.value,
    ]),
  );

  return `${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}
