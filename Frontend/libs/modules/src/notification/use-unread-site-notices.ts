'use client';

import { useQuery } from '@tanstack/react-query';

import {
  listNotificationsAsync,
  siteNotificationKeys,
  type NotificationPage,
} from './api';
import { countUnreadSiteNotices } from './site-notices';

/**
 * How often the bell asks again while the tab is in view: nothing is pushed, so it polls, and a
 * hidden tab waits for its return (`note/notification-spec-explained.md`, spec §6).
 */
const POLL_INTERVAL_MS = 60_000;

function unreadCountOf({ items }: NotificationPage) {
  return countUnreadSiteNotices(items);
}

/**
 * The bell's count. The desktop and the phone top bars are both mounted, one hidden by CSS, and each
 * holds a bell: under one key the two share a single poll. TanStack holds the interval while the tab
 * is hidden and reads at once when it comes back. A failed read keeps the last count and raises no
 * error toast: nobody asked. A bell is there only for a signed-in viewer, and signing out reloads
 * the page.
 */
export function useUnreadSiteNotices(): number {
  const { data } = useQuery({
    queryKey: siteNotificationKeys.unread,
    // The 100 newest unread at most: past nine the badge says 9+ anyway.
    queryFn: () => listNotificationsAsync({ unreadOnly: true }),
    select: unreadCountOf,
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
    meta: { quietErrors: true },
  });

  return data ?? 0;
}
