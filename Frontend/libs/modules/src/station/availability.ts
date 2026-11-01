/**
 * 「現在過去有沒有人在」: a station's operational status and its hours, read together (prototype
 * site-route.js:33-90, after Sucre 2026-08-09). They are two things — whether the station still
 * runs, set by hand, and whether this hour is one it serves — and the reader needs both at once.
 */

export type StationAvailabilityTone = 'success' | 'warning' | 'neutral';

// A station's hours are Taiwan's clock, read the same way from anywhere — a relative abroad checking
// on one included.
const STATION_CLOCK = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Taipei',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function minutesIntoStationDay(now: Date): number {
  const parts = STATION_CLOCK.formatToParts(now);
  const read = (type: 'hour' | 'minute') =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return read('hour') * 60 + read('minute');
}

export interface StationAvailability {
  headline: string;
  tone: StationAvailabilityTone;
  detail: string;
}

export interface StationAvailabilityInput {
  /** The backend's `operationalStatus`; a station without one is running, as it defaults. */
  operationalStatus?: string | null;
  opHour?: string | null;
}

/**
 * The hours as typed, or null when there are none — including the 'unknown' and the lone dash that
 * imported data carries in their place.
 */
export function readOpHour(opHour: string | null | undefined): string | null {
  const value = opHour?.trim() ?? '';

  return value && value.toLowerCase() !== 'unknown' && !/^[-–—]+$/.test(value)
    ? value
    : null;
}

/**
 * Whether `now` falls in the hours. Null when they cannot be read: only hours that are, as a whole,
 * one `HH:MM–HH:MM` range or round the clock are understood. Anything more — a weekly schedule, two
 * ranges in a day — is not judged by its first part, which would answer wrongly on the other days
 * and hours; it is shown as typed.
 */
export function isWithinOpenHours(
  opHour: string | null | undefined,
  now: Date,
): boolean | null {
  const hours = readOpHour(opHour);

  if (!hours) {
    return null;
  }

  if (/^(?:24\s*(?:小時|h)|全日)(?:開放|營業)?$/i.test(hours)) {
    return true;
  }

  const range = hours.match(
    /^(\d{1,2}):(\d{2})\s*[–\-~至]\s*(\d{1,2}):(\d{2})$/,
  );

  if (!range) {
    return null;
  }

  const current = minutesIntoStationDay(now);
  const from = Number(range[1]) * 60 + Number(range[2]);
  const to = Number(range[3]) * 60 + Number(range[4]);

  // A range that ends before it starts runs past midnight.
  return to >= from
    ? current >= from && current < to
    : current >= from || current < to;
}

export function resolveStationAvailability(
  station: StationAvailabilityInput,
  now: Date = new Date(),
): StationAvailability {
  if (station.operationalStatus === 'temporarily_closed') {
    return {
      headline: '暫停服務',
      tone: 'warning',
      detail: '站點還在，但目前暫停服務',
    };
  }

  if (station.operationalStatus === 'permanently_closed') {
    return {
      headline: '已關閉',
      tone: 'neutral',
      detail: '這個站點已經關閉，不再營運',
    };
  }

  const hours = readOpHour(station.opHour);

  switch (isWithinOpenHours(hours, now)) {
    case true:
      return {
        headline: '現在開放',
        tone: 'success',
        detail: `服務時間 ${hours}`,
      };
    case false:
      return {
        headline: '休息中',
        tone: 'neutral',
        detail: `服務時間 ${hours}，此時段沒有服務`,
      };
    // Hours that cannot be read leave only the status, named as the back office names it.
    default:
      return {
        headline: '開設中',
        tone: 'success',
        detail: hours ? `服務時間 ${hours}` : '服務時間未提供',
      };
  }
}
