'use client';

import { queryOptions } from '@tanstack/react-query';

import { createRestClient, responseData } from '@rescue-frontend/data-access';
import type { components } from '@rescue-frontend/data-access/openapi';

import { sessionExpiryFetch } from '../session/end-expired-session';

// Through the proxy, which refreshes a spent access token on the way, as `auth/api/client.ts` does.
const notificationApiClient = createRestClient(sessionExpiryFetch);

/** One page of `GET /notifications`. */
export type NotificationPage =
  components['schemas']['NotificationListResponse'];

/**
 * Where TanStack keeps the viewer's notifications: the bell's count and the drawer's list, both
 * under `all`, which is invalidated once a notice is read.
 */
export const siteNotificationKeys = {
  all: ['site-notifications'],
  unread: ['site-notifications', 'unread'],
  list: ['site-notifications', 'list'],
} as const;

/** The back office's bell reads the same notifications under its own keys, so the two never share a cache. */
export const adminNotificationKeys = {
  all: ['admin-notifications'],
  unread: ['admin-notifications', 'unread'],
  list: ['admin-notifications', 'list'],
} as const;

/**
 * The most the backend sends in one page. The site shows only some of the kinds it sends, so it
 * reads as many as it can at once rather than a page of 20 that may hold none of its own.
 */
export const NOTIFICATION_PAGE_SIZE = 100;

/** The viewer's notifications, urgent first and then newest first, as the backend orders them. */
export function listNotificationsAsync({
  page = 1,
  unreadOnly = false,
}: { page?: number; unreadOnly?: boolean } = {}) {
  return notificationApiClient
    .GET('/api/v1/notifications', {
      params: {
        query: {
          page,
          page_size: NOTIFICATION_PAGE_SIZE,
          unread_only: unreadOnly,
        },
      },
    })
    .then(responseData);
}

/**
 * How often a bell asks again while the tab is in view: nothing is pushed, so it polls, and a
 * hidden tab waits for its return (`note/notification-spec-explained.md`, spec §6).
 */
export const NOTIFICATION_POLL_INTERVAL_MS = 60_000;

/**
 * A bell's read of the viewer's unread notifications, polled: the 100 newest at most, of every
 * kind, each bell keeping its own under its own key. A failed read keeps the last answer and
 * raises no error toast: nobody asked.
 */
export function unreadNotificationsQuery(
  queryKey: typeof siteNotificationKeys.unread | typeof adminNotificationKeys.unread,
) {
  return queryOptions({
    queryKey,
    queryFn: () => listNotificationsAsync({ unreadOnly: true }),
    refetchInterval: NOTIFICATION_POLL_INTERVAL_MS,
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
    meta: { quietErrors: true },
  });
}

/** One notification read. `read-all` would mark the back office's too, which the site does not show. */
export function markNotificationReadAsync(uuid: string) {
  return notificationApiClient
    .PATCH('/api/v1/notifications/{uuid}/read', {
      params: { path: { uuid } },
    })
    .then(() => undefined);
}
