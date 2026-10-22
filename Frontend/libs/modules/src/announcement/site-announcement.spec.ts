import { describe, expect, it } from 'vitest';

import { newestAnnouncement } from './site-announcement';

const announcement = (uuid: string, publishedAt: string | null) => ({
  uuid,
  content: `公告 ${uuid}`,
  publishedAt,
});

describe('newestAnnouncement', () => {
  it('shows nothing when no announcement is live', () => {
    expect(newestAnnouncement([])).toBeNull();
  });

  it('shows the one published last, wherever the list puts it', () => {
    const older = announcement('a', '2026-10-20T08:00:00+00:00');
    const newest = announcement('b', '2026-10-22T09:30:00+00:00');
    const middle = announcement('c', '2026-10-21T23:00:00+00:00');

    expect(newestAnnouncement([older, newest, middle])).toBe(newest);
  });

  it('compares the instants, not the text, across time zones', () => {
    const utc = announcement('a', '2026-10-22T01:00:00+00:00');
    const taipei = announcement('b', '2026-10-22T08:30:00+08:00');

    expect(newestAnnouncement([taipei, utc])).toBe(utc);
  });

  it('keeps the list order between two published at the same moment', () => {
    const first = announcement('a', '2026-10-22T09:30:00+00:00');
    const second = announcement('b', '2026-10-22T09:30:00+00:00');

    expect(newestAnnouncement([first, second])).toBe(first);
  });

  it('puts one without a publish time after any that has one', () => {
    const undated = announcement('a', null);
    const dated = announcement('b', '2026-10-01T00:00:00+00:00');

    expect(newestAnnouncement([undated, dated])).toBe(dated);
    expect(newestAnnouncement([undated])).toBe(undated);
  });
});
