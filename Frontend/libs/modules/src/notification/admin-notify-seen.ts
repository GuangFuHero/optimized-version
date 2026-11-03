import type { AdminNotice } from './admin-notices';

/*
 * The bell's number (`Design/後台/docs/通知鈴鐺.md`「鈴鐺上的數字」): the notices that came in since
 * the list was last opened, not how many are still unread. Opening the list clears it and marks
 * nothing read. Station updates (站點營運狀態更新、新建站點) never count. The backend keeps no "seen",
 * so the last opening lives in this browser, one per account.
 */

function timeOf(at: string | null | undefined): number | null {
  if (!at) {
    return null;
  }
  const ms = Date.parse(at);
  return Number.isNaN(ms) ? null : ms;
}

/** Unread notices that count on the bell and came after `seenAt` (all of them before the first opening). */
export function countNewAdminNotices(
  notices: readonly AdminNotice[],
  seenAt: string | null,
): number {
  const seen = timeOf(seenAt);

  return notices.filter((notice) => {
    if (notice.read || !notice.countsOnBell) {
      return false;
    }
    if (seen === null) {
      return true;
    }
    const at = timeOf(notice.createdAt);
    return at !== null && at > seen;
  }).length;
}

/** The latest `createdAt` among the notices: what the bell has shown once the list opens. */
export function newestCreatedAt(
  notices: readonly AdminNotice[],
): string | null {
  let newest: { at: string; ms: number } | null = null;
  for (const { createdAt } of notices) {
    const ms = timeOf(createdAt);
    if (createdAt && ms !== null && (!newest || ms > newest.ms)) {
      newest = { at: createdAt, ms };
    }
  }
  return newest?.at ?? null;
}

export function seenAtKey(userUuid: string): string {
  return `admin-notify:seen-at:${userUuid}`;
}

/** The last opening for this account, or null when there is none, it is unreadable, or storage is blocked. */
export function readSeenAt(
  storage: Pick<Storage, 'getItem'> | null,
  userUuid: string,
): string | null {
  try {
    const value = storage?.getItem(seenAtKey(userUuid)) ?? null;
    return timeOf(value) === null ? null : value;
  } catch {
    return null;
  }
}

/** Records an opening. Never moves back (another tab may have seen later), never throws. */
export function writeSeenAt(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null,
  userUuid: string,
  at: string,
): void {
  const next = timeOf(at);
  if (!storage || next === null) {
    return;
  }
  const current = timeOf(readSeenAt(storage, userUuid));
  if (current !== null && current >= next) {
    return;
  }
  try {
    storage.setItem(seenAtKey(userUuid), at);
  } catch {
    // Private mode or blocked storage: the number simply comes back on the next load.
  }
}

/** The bell's spoken name. 「未讀」 is kept for the list's own rows (通知鈴鐺.md). */
export function bellNewLabel(count: number): string {
  return count > 0 ? `通知，${count} 則新通知` : '通知';
}
