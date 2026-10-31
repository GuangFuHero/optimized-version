import { describe, expect, it } from 'vitest';

import { getFreshness } from './freshness';

const now = new Date('2026-10-21T12:00:00Z');
const ago = (minutes: number) =>
  new Date(now.getTime() - minutes * 60_000).toISOString();

describe('getFreshness', () => {
  it.each([
    [0, 'fresh', '剛剛'],
    [5, 'fresh', '5 分鐘前'],
    [90, 'fresh', '1 小時前'],
    [24 * 60, 'stale', '1 天前'],
    [72 * 60, 'expired', '3 天前'],
  ])('%i minutes ago is %s (%s)', (minutes, level, relative) => {
    expect(getFreshness(ago(minutes), now)).toMatchObject({ level, relative });
  });

  it('handles a missing or invalid timestamp', () => {
    expect(getFreshness(null, now)).toEqual({
      level: 'unknown',
      relative: '—',
      minutes: null,
    });
    expect(getFreshness('not a date', now).level).toBe('unknown');
  });
});
