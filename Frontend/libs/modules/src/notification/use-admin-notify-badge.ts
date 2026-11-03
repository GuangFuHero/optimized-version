'use client';

import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

import { useCurrentUser } from '@rescue-frontend/data-access/admin';

import { localDeviceStorage } from '../storage';
import { readAdminNotices, type AdminNotice } from './admin-notices';
import {
  countNewAdminNotices,
  newestCreatedAt,
  readSeenAt,
  seenAtKey,
  writeSeenAt,
} from './admin-notify-seen';
import { adminNotificationKeys, unreadNotificationsQuery } from './api';

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
    // The 100 newest unread, site notices among them: an account with more misses the oldest
    // (待後端: an unread count by type).
    ...unreadNotificationsQuery(adminNotificationKeys.unread),
    select: (page): AdminNotice[] => readAdminNotices(page.items),
    enabled: userUuid !== null,
  });

  const [seen, setSeen] = useState<{ user: string; at: string | null } | null>(
    null,
  );

  useEffect(() => {
    if (!userUuid) {
      return;
    }
    const load = () =>
      setSeen({ user: userUuid, at: readSeenAt(localDeviceStorage(), userUuid) });
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
      writeSeenAt(localDeviceStorage(), userUuid, at);
      setSeen({ user: userUuid, at: readSeenAt(localDeviceStorage(), userUuid) ?? at });
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
