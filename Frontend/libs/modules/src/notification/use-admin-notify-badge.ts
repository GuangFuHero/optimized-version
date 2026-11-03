'use client';

import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

import { useCurrentUser } from '@rescue-frontend/data-access/admin';

import { readAdminNotices, type AdminNotice } from './admin-notices';
import {
  countNewAdminNotices,
  newestCreatedAt,
  readSeenAt,
  seenAtKey,
  writeSeenAt,
} from './admin-notify-seen';
import { adminNotificationKeys, listNotificationsAsync } from './api';

/** Nothing is pushed, so the bell asks again each minute while the tab is in view, as the site's does. */
const POLL_INTERVAL_MS = 60_000;

function browserStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * The bell's number: unread back-office notices that came in since this account last opened the
 * list (`admin-notify-seen.ts`). It stays 0 until the account is known, so a stale or another
 * account's opening never shows. `markSeen` clears it at once, then once more after a fresh read,
 * so a notice that landed between polls and shows in the opened list does not come back as new.
 */
export function useAdminNotifyBadge(): {
  count: number;
  markSeen: () => void;
} {
  const { data: user } = useCurrentUser();
  const userUuid = user?.uuid ?? null;

  const unread = useQuery({
    queryKey: adminNotificationKeys.unread,
    // The 100 newest unread at most, site notices among them: past 99 the badge says 99+ anyway.
    queryFn: () => listNotificationsAsync({ unreadOnly: true }),
    select: (page): AdminNotice[] => readAdminNotices(page.items),
    enabled: userUuid !== null,
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
    meta: { quietErrors: true },
  });

  const [seen, setSeen] = useState<{ user: string; at: string | null } | null>(
    null,
  );

  useEffect(() => {
    if (!userUuid) {
      return;
    }
    const load = () =>
      setSeen({ user: userUuid, at: readSeenAt(browserStorage(), userUuid) });
    load();
    // Another tab opened the list: its bell cleared, so this one does too.
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === seenAtKey(userUuid)) {
        load();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [userUuid]);

  const record = useCallback(
    (notices: readonly AdminNotice[] | undefined) => {
      const at = notices ? newestCreatedAt(notices) : null;
      if (!userUuid || !at) {
        return;
      }
      writeSeenAt(browserStorage(), userUuid, at);
      setSeen({ user: userUuid, at: readSeenAt(browserStorage(), userUuid) ?? at });
    },
    [userUuid],
  );

  const { data: notices, refetch } = unread;
  const markSeen = useCallback(() => {
    record(notices);
    void refetch().then((result) => record(result.data));
  }, [notices, record, refetch]);

  const ready = userUuid !== null && seen?.user === userUuid;
  const count = ready && notices ? countNewAdminNotices(notices, seen.at) : 0;

  return { count, markSeen };
}
