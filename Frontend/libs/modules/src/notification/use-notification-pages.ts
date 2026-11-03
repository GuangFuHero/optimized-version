'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { listNotificationsAsync } from './api';
import { readsNextPageUnasked, type NotificationRow } from './site-notices';

/**
 * A list of the viewer's notifications, page by page, for a bell that shows only some kinds: the
 * site's drawer and the back office's list each keep their own under `listKey`, and `read` keeps the
 * kinds it shows. Read afresh at each opening.
 *
 * Pages that show nothing, with more after them, would leave only 載入更多: the next is read without
 * a tap, a round at a time. Not while a read is on its way (each opening reads the pages it has
 * again first), nor after one failed, which 載入更多 tries again.
 */
export function useNotificationPages<T>({
  listKey,
  read,
}: {
  listKey: readonly string[];
  read: (rows: readonly NotificationRow[]) => T[];
}) {
  const list = useInfiniteQuery({
    queryKey: listKey,
    queryFn: ({ pageParam }) => listNotificationsAsync({ page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last, pages) =>
      last.has_more ? pages.length + 1 : undefined,
    refetchOnMount: 'always',
    // The list says so itself, in place of the notices.
    meta: { quietErrors: true },
  });

  const notices = list.data
    ? read(list.data.pages.flatMap((page) => page.items))
    : null;

  const readingOn =
    notices !== null &&
    readsNextPageUnasked({
      shown: notices.length,
      pagesRead: list.data?.pages.length ?? 0,
      hasNextPage: list.hasNextPage,
      nextPageFailed: list.isFetchNextPageError,
    });
  const readNext = readingOn && !list.isFetching;
  const { fetchNextPage } = list;

  useEffect(() => {
    if (readNext) {
      void fetchNextPage();
    }
  }, [readNext, fetchNextPage]);

  return {
    list,
    /** The notices read so far that this bell shows, or null before the first page is in. */
    notices,
    /** Nothing shown yet and the next page on its way, by itself or from a tap: one loading line, no button. */
    searching:
      notices !== null &&
      notices.length === 0 &&
      (readingOn || list.isFetchingNextPage),
    /** Every page read and none of them shows anything. */
    empty: notices !== null && notices.length === 0 && !list.hasNextPage,
  };
}
