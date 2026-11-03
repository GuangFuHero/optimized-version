'use client';

import { useQuery } from '@tanstack/react-query';

import {
  siteNotificationKeys,
  unreadNotificationsQuery,
  type NotificationPage,
} from './api';
import { countUnreadSiteNotices } from './site-notices';

function unreadCountOf({ items }: NotificationPage) {
  return countUnreadSiteNotices(items);
}

/**
 * The bell's count. The desktop and the phone top bars are both mounted, one hidden by CSS, and each
 * holds a bell: under one key the two share a single poll. TanStack holds the interval while the tab
 * is hidden and reads at once when it comes back. A bell is there only for a signed-in viewer, and
 * signing out reloads the page. Past nine the badge says 9+, so the 100 newest unread are plenty.
 */
export function useUnreadSiteNotices(): number {
  const { data } = useQuery({
    ...unreadNotificationsQuery(siteNotificationKeys.unread),
    select: unreadCountOf,
  });

  return data ?? 0;
}
