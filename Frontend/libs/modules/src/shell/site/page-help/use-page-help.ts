'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useSyncExternalStore } from 'react';

import {
  SITE_PAGE_HELP,
  hasSeenPageHelp,
  localSeenStorage,
  markPageHelpSeen,
  pageHelpKey,
  type PageHelp,
  type SitePageHelpKey,
} from './page-help';

// One record for the desktop ？ and the phone menu's row alike: opened in one, the other's dot goes.
const listeners = new Set<() => void>();
// Opened this visit, for a device that will not keep the mark: the dot goes now, back next time.
const seenThisVisit = new Set<SitePageHelpKey>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export interface CurrentPageHelp {
  help: PageHelp;
  /** Not opened on this device yet: the ？ carries a dot (prototype `wg-help.jsx`). */
  fresh: boolean;
  markSeen: () => void;
}

/** This page's help, or null on a page without any (行前資訊, the account pages). */
export function usePageHelp(): CurrentPageHelp | null {
  const key = pageHelpKey(usePathname() ?? '');
  const seen = useSyncExternalStore(
    subscribe,
    () =>
      key === null ||
      seenThisVisit.has(key) ||
      hasSeenPageHelp(localSeenStorage(), key),
    // Seen, on the server and while hydrating: the device's record is read only once on it.
    () => true,
  );

  const markSeen = useCallback(() => {
    if (!key) {
      return;
    }

    seenThisVisit.add(key);
    markPageHelpSeen(localSeenStorage(), key);
    listeners.forEach((listener) => listener());
  }, [key]);

  return key ? { help: SITE_PAGE_HELP[key], fresh: !seen, markSeen } : null;
}
