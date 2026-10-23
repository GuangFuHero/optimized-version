'use client';

import { useQuery } from '@tanstack/react-query';
import { useClient } from 'urql';

import { SiteAnnouncementsDocument } from '@rescue-frontend/data-access';

import { newestAnnouncement } from './site-announcement';

/** Often enough that a new announcement reaches someone who keeps the map open. */
const POLL_INTERVAL_MS = 60_000;

/**
 * The announcement the site shows now, or null. Read again every minute while the tab is in view
 * (TanStack holds the interval while it is hidden), and at once when the tab comes back or the
 * connection does: in a disaster the network comes and goes, and a tab in the background has nobody
 * to show it to. A failed read keeps the last answer up and raises no error toast: nobody asked.
 */
export function useSiteAnnouncement() {
  const client = useClient();
  const { data } = useQuery({
    queryKey: ['site-announcements'],
    queryFn: async () => {
      const result = await client
        .query(SiteAnnouncementsDocument, {}, { requestPolicy: 'network-only' })
        .toPromise();

      // urql resolves with the error rather than throwing it; TanStack needs the throw to keep the
      // last answer and try again.
      if (result.error) {
        throw result.error;
      }

      return result.data?.announcements ?? [];
    },
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
    meta: { quietErrors: true },
  });

  return newestAnnouncement(data ?? []);
}
