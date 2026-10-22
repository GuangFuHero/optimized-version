'use client';

import { useEffect } from 'react';
import { useQuery } from 'urql';

import { SiteAnnouncementsDocument } from '@rescue-frontend/data-access';

import { newestAnnouncement } from './site-announcement';

// The banner sits above every page: it must never suspend the page under it.
const SITE_ANNOUNCEMENTS_CONTEXT = { suspense: false } as const;

/** Often enough that a new announcement reaches someone who keeps the map open. */
const POLL_INTERVAL_MS = 60_000;

/**
 * The announcement the site shows now, or null. Read again every minute while the tab is in view,
 * and at once when the tab comes back or the connection does: in a disaster the network comes and
 * goes, and a tab in the background has nobody to show it to.
 */
export function useSiteAnnouncement() {
  const [{ data }, reexecute] = useQuery({
    query: SiteAnnouncementsDocument,
    context: SITE_ANNOUNCEMENTS_CONTEXT,
  });

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') {
        reexecute({ requestPolicy: 'network-only' });
      }
    };
    const timer = window.setInterval(refresh, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('online', refresh);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('online', refresh);
    };
  }, [reexecute]);

  return newestAnnouncement(data?.announcements ?? []);
}
