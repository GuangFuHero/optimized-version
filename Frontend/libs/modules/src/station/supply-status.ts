/**
 * 物資狀況 as a station's detail shows it: what the station is short of, and how long ago that last
 * changed — 「飲用水見底（3 小時前更新）」 (backend ADR-333). A line about water running out is worth
 * little without knowing whether it was written this morning or last week.
 */

import { timeAgo } from '../time';

export interface SupplyStatusLine {
  text: string;
  /** 「3 小時前更新」, or null when the backend has no time for it. */
  updated: string | null;
}

const WEEK = 7 * 24 * 60 * 60_000;

// Past a week a count of days reads as vague as a date, and less exact: the date, on Taiwan's clock.
const UPDATED_ON = new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei',
  month: 'numeric',
  day: 'numeric',
});

function describeUpdated(updatedAt: string, now: Date): string | null {
  const ago = timeAgo(updatedAt, now);

  if (!ago) {
    return null;
  }

  const at = new Date(updatedAt);

  return now.getTime() - at.getTime() < WEEK
    ? `${ago}更新`
    : `${UPDATED_ON.format(at)} 更新`;
}

/** Null when the station has no line: nothing is said rather than 「未提供」 under every station. */
export function describeSupplyStatus(
  supplyStatus: string | null | undefined,
  updatedAt: string | null | undefined,
  now: Date = new Date(),
): SupplyStatusLine | null {
  const text = supplyStatus?.trim();

  if (!text) {
    return null;
  }

  return { text, updated: updatedAt ? describeUpdated(updatedAt, now) : null };
}
