import { describe, expect, it } from 'vitest';

import type { AdminNotice } from './admin-notices';
import {
  countNewAdminNotices,
  newestCreatedAt,
  readSeenAt,
  seenAtKey,
  writeSeenAt,
} from './admin-notify-seen';

function notice(overrides: Partial<AdminNotice> = {}): AdminNotice {
  return {
    uuid: 'n1',
    kind: 'suggestion',
    group: 'act',
    summary: '站點有修改建議待審',
    detail: null,
    read: false,
    createdAt: '2026-11-03T10:00:00Z',
    ago: null,
    href: '/stations',
    countsOnBell: true,
    ...overrides,
  };
}

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, value),
  };
}

describe('countNewAdminNotices', () => {
  it('counts every unread notice before the list was ever opened', () => {
    expect(
      countNewAdminNotices([notice({ uuid: 'a' }), notice({ uuid: 'b' })], null),
    ).toBe(2);
  });

  it('counts only notices newer than the last opening (Sucre: 5 → open → close → one more gives 1)', () => {
    const seenAt = '2026-11-03T10:00:00Z';
    const notices = [
      ...['a', 'b', 'c', 'd', 'e'].map((uuid) =>
        notice({ uuid, createdAt: '2026-11-03T09:00:00Z' }),
      ),
      notice({ uuid: 'f', createdAt: '2026-11-03T10:05:00Z' }),
    ];

    expect(countNewAdminNotices(notices, seenAt)).toBe(1);
  });

  it('leaves out station updates and notices already read', () => {
    expect(
      countNewAdminNotices(
        [
          notice({ uuid: 'a', countsOnBell: false }),
          notice({ uuid: 'b', read: true }),
          notice({ uuid: 'c' }),
        ],
        null,
      ),
    ).toBe(1);
  });

  it('compares times, not strings: an offset time after seenAt counts', () => {
    expect(
      countNewAdminNotices(
        [notice({ createdAt: '2026-11-03T18:30:00+08:00' })],
        '2026-11-03T10:00:00Z',
      ),
    ).toBe(1);
  });

  it('does not count a notice with no time once the list has been opened', () => {
    expect(
      countNewAdminNotices([notice({ createdAt: null })], '2026-11-03T10:00:00Z'),
    ).toBe(0);
  });
});

describe('newestCreatedAt', () => {
  it('picks the latest time, whatever the order', () => {
    expect(
      newestCreatedAt([
        notice({ createdAt: '2026-11-03T09:00:00Z' }),
        notice({ createdAt: '2026-11-03T11:00:00Z' }),
        notice({ createdAt: null }),
      ]),
    ).toBe('2026-11-03T11:00:00Z');
  });

  it('is null with nothing timed', () => {
    expect(newestCreatedAt([])).toBeNull();
    expect(newestCreatedAt([notice({ createdAt: null })])).toBeNull();
  });
});

describe('seen-at storage', () => {
  it('keys are per user', () => {
    const storage = memoryStorage();
    writeSeenAt(storage, 'u1', '2026-11-03T10:00:00Z');

    expect(seenAtKey('u1')).toBe('admin-notify:seen-at:u1');
    expect(readSeenAt(storage, 'u1')).toBe('2026-11-03T10:00:00Z');
    expect(readSeenAt(storage, 'u2')).toBeNull();
  });

  it('writeSeenAt keeps the later time', () => {
    const storage = memoryStorage();
    writeSeenAt(storage, 'u1', '2026-11-03T10:05:00Z');
    writeSeenAt(storage, 'u1', '2026-11-03T10:01:00Z');

    expect(readSeenAt(storage, 'u1')).toBe('2026-11-03T10:05:00Z');
  });

  it('survives a throwing or missing storage', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };

    expect(readSeenAt(throwing, 'u1')).toBeNull();
    expect(() => writeSeenAt(throwing, 'u1', '2026-11-03T10:00:00Z')).not.toThrow();
    expect(readSeenAt(null, 'u1')).toBeNull();
    expect(() => writeSeenAt(null, 'u1', '2026-11-03T10:00:00Z')).not.toThrow();
  });

  it('ignores garbage', () => {
    const storage = memoryStorage();
    storage.setItem(seenAtKey('u1'), 'abc');

    expect(readSeenAt(storage, 'u1')).toBeNull();
  });
});
