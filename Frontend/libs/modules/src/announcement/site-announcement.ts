/** What the banner needs of a live announcement (`SiteAnnouncements`). */
export interface LiveAnnouncement {
  uuid: string;
  content: string;
  /** ISO 8601 with an offset; null only for one never published, which is not live. */
  publishedAt?: string | null;
}

const publishedTime = ({ publishedAt }: LiveAnnouncement) => {
  const time = publishedAt ? Date.parse(publishedAt) : Number.NaN;

  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
};

/**
 * The one announcement the banner shows: the one published last. A page has one announcement at a
 * time and publishing replaces it (prototype EA-FEAT-001, D-12); until the backend enforces that,
 * several can be live, and the newest is the one meant to be read.
 */
export function newestAnnouncement<T extends LiveAnnouncement>(
  announcements: readonly T[],
): T | null {
  return announcements.reduce<T | null>(
    (newest, candidate) =>
      newest === null || publishedTime(candidate) > publishedTime(newest)
        ? candidate
        : newest,
    null,
  );
}
