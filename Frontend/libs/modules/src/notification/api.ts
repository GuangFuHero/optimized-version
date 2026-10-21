'use client';

import { createRestClient, responseData } from '@rescue-frontend/data-access';

import { sessionExpiryFetch } from '../session/end-expired-session';

// Through the proxy, which refreshes a spent access token on the way, as `auth/api/client.ts` does.
const notificationApiClient = createRestClient(sessionExpiryFetch);

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

/** One notification read. `read-all` would mark the back office's too, which the site does not show. */
export function markNotificationReadAsync(uuid: string) {
  return notificationApiClient
    .PATCH('/api/v1/notifications/{uuid}/read', {
      params: { path: { uuid } },
    })
    .then(() => undefined);
}
