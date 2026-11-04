'use client';

import {
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';

import { markNotificationReadAsync, type NotificationPage } from './api';
import { notMarkedRead, withReadState } from './site-notices';

/** The list's cached pages with those in `uuids` read, or unread again. */
function setCachedReadState(
  queryClient: QueryClient,
  listKey: QueryKey,
  uuids: readonly string[],
  read: boolean,
) {
  if (uuids.length === 0) {
    return;
  }

  queryClient.setQueryData<InfiniteData<NotificationPage>>(
    listKey,
    (data) =>
      data && {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          items: withReadState(page.items, uuids, read),
        })),
      },
  );
}

/**
 * Marks notices read, for the site's list and the back office's alike. Shown read at once, and read
 * for good in the background. A PATCH that fails (offline, a 5xx) puts its notice back to unread,
 * and 全部標為已讀 with it, to try again; then every key in `invalidateKeys` is read again.
 */
export function useMarkNotificationsRead({
  listKey,
  invalidateKeys,
}: {
  listKey: QueryKey;
  invalidateKeys: readonly QueryKey[];
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (uuids: string[]) =>
      Promise.allSettled(uuids.map(markNotificationReadAsync)),
    onMutate: async (uuids) => {
      // A read of the list still on its way would put the notices back as they were.
      await queryClient.cancelQueries({ queryKey: listKey });
      setCachedReadState(queryClient, listKey, uuids, true);
    },
    onSuccess: (results, uuids) =>
      setCachedReadState(
        queryClient,
        listKey,
        notMarkedRead(uuids, results),
        false,
      ),
    onSettled: () =>
      Promise.all(
        invalidateKeys.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      ),
  });
}
