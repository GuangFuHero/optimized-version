// Numbers only: `en-US` spells each part as digits, where `zh-TW` would add 上午／下午.
const TAIWAN_PARTS_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export interface TaiwanDateParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
}

/** A moment's date and clock in Taiwan time, each part as zero-padded digits (「09」, 「05」). */
export function taiwanDateParts(time: Date): TaiwanDateParts {
  const parts = Object.fromEntries(
    TAIWAN_PARTS_FORMAT.formatToParts(time).map((part) => [
      part.type,
      part.value,
    ]),
  );

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
  };
}

function parse(iso: string | null | undefined): Date | null {
  const time = iso ? new Date(iso) : null;
  return time && !Number.isNaN(time.getTime()) ? time : null;
}

/**
 * A moment as 「9/30 14:05」, in Taiwan time whatever the device's zone, without the year — for what
 * is still going on: claims to keep, requests filed, the briefing to pack by. Null for a missing or
 * broken time.
 */
export function formatTaiwanTime(
  iso: string | null | undefined,
): string | null {
  const time = parse(iso);

  if (!time) {
    return null;
  }

  const parts = taiwanDateParts(time);
  return `${Number(parts.month)}/${Number(parts.day)} ${parts.hour}:${parts.minute}`;
}

/**
 * A moment as 「2026/09/30 14:05」, in Taiwan time, year included — for records that outlive the
 * week: when a station was last updated, when a suggestion was first made. Null for a missing or
 * broken time.
 */
export function formatTaiwanDateTime(
  iso: string | null | undefined,
): string | null {
  const time = parse(iso);

  if (!time) {
    return null;
  }

  const parts = taiwanDateParts(time);
  return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}
