'use client';

import { useEffect, useRef, type ReactNode } from 'react';

import { clearAllHelpRequestDrafts } from '../../ticket/help-request';
import {
  isSigningOutHere,
  markSigningOutHere,
  sessionStorageOrNull,
} from '../../session/end-expired-session';
import { SessionExpiredNotice } from '../../session/session-expired-notice';
import { SiteShell } from '../../shell/site';
import {
  reloginHref,
  shouldReloadForSignOut,
} from '@rescue-frontend/modules/session';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';

import { useAuthSession } from '../../session/auth-session';
import { logoutAsync } from '../api/client';

export function PortalSiteShell({ children }: { children: ReactNode }) {
  const { status, user } = useAuthSession();
  const router = useRouter();
  const isAuthenticated = status === 'authenticated' && !!user;
  const previousSession = useRef({ status, user });

  // Signed out in another tab — from its menu, or because its session ended — or signed in there
  // as someone else, and this tab has read its session again. Reload as handleSignOut does,
  // without a notice: that is for the tab it ended in.
  useEffect(() => {
    const previous = previousSession.current;
    previousSession.current = { status, user };

    if (
      shouldReloadForSignOut({
        previous,
        current: { status, user },
        signingOutHere: isSigningOutHere(),
      })
    ) {
      window.location.reload();
    }
  }, [status, user]);

  const handleSignOut = () => {
    // Its own reload below; the watch above must not add another.
    markSigningOutHere();
    // The person chose to leave, maybe on a shared device: no half-filled 請求協助 (address,
    // phone) is left in the tab for whoever uses it next. First, before the backend is asked:
    // closing a slow tab must not keep it. A session that ended keeps its draft.
    clearAllHelpRequestDrafts(sessionStorageOrNull());
    void (async () => {
      try {
        await logoutAsync();
      } catch {
        // Keep local sign-out resilient even if backend revocation fails.
      }

      await signOut({ redirect: false });
      // Reload, not `router.refresh()`: what the page fetched while signed in — the list's
      // claims, the map's exact pins, the urql cache — lives in the browser, and a refresh only
      // re-renders the server's part. A guest must not go on seeing it.
      window.location.reload();
    })();
  };

  // From `window.location`, not `usePathname()`: the map rewrites its path in place
  // (`replaceState`), and the router's pathname stays a bare `/map`.
  const handleSignIn = () => {
    router.push(reloginHref(window.location));
  };

  return (
    <>
      <SiteShell
        isAuthenticated={isAuthenticated}
        userName={user?.name}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
      >
        {children}
      </SiteShell>
      <SessionExpiredNotice />
    </>
  );
}
