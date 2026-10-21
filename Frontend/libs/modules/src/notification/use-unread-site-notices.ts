'use client';

import { useSyncExternalStore } from 'react';

import { listNotificationsAsync } from './api';
import { countUnreadSiteNotices } from './site-notices';

/**
 * How often the bell asks again while the tab is in view: nothing is pushed, so it polls, and a
 * hidden tab waits for its return (`note/notification-spec-explained.md`, spec §6).
 */
const POLL_INTERVAL_MS = 60_000;

/*
 * One count for the whole page. The desktop and the phone top bars are both mounted, one hidden by
 * CSS, and each holds a bell: kept here, the two share a single poll instead of each running one.
 */
let unreadCount = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
// Only the latest read counts: one answering after a newer one would put an old count back.
let latestRead = 0;

function publish(count: number) {
  if (count === unreadCount) {
    return;
  }

  unreadCount = count;
  listeners.forEach((listener) => listener());
}

async function readUnreadCountAsync() {
  const read = ++latestRead;

  try {
    // The 100 newest unread at most: past nine the badge says 9+ anyway.
    const { items } = await listNotificationsAsync({ unreadOnly: true });

    if (read === latestRead) {
      publish(countUnreadSiteNotices(items));
    }
  } catch {
    // The last count stands: a read that failed says nothing new about what is unread. A session
    // that ended is the proxy's to report, and `sessionExpiryFetch` acts on it.
  }
}

function readIfInView() {
  if (document.visibilityState === 'visible') {
    void readUnreadCountAsync();
  }
}

function start() {
  void readUnreadCountAsync();
  timer = setInterval(readIfInView, POLL_INTERVAL_MS);
  // Back to the tab: read at once rather than at the next tick.
  document.addEventListener('visibilitychange', readIfInView);
}

function stop() {
  clearInterval(timer);
  timer = undefined;
  document.removeEventListener('visibilitychange', readIfInView);
  // A read still on its way belongs to the bell that was, whoever signs in next.
  latestRead += 1;
  unreadCount = 0;
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  if (listeners.size === 1) {
    start();
  }

  return () => {
    listeners.delete(listener);

    if (listeners.size === 0) {
      stop();
    }
  };
}

/** Count again now: a notice was just read in the drawer. */
export function refreshUnreadSiteNotices(): void {
  if (listeners.size > 0) {
    void readUnreadCountAsync();
  }
}

/**
 * The bell's count, polled from the first bell mounted until the last one goes. A bell is there
 * only for a signed-in viewer, and signing out reloads the page.
 */
export function useUnreadSiteNotices(): number {
  return useSyncExternalStore(
    subscribe,
    () => unreadCount,
    () => 0,
  );
}
