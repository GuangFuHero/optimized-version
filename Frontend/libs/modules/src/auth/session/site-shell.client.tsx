'use client';

import { useEffect, useRef, type ReactNode } from 'react';

import {
  isSigningOutHere,
  sessionStorageOrNull,
} from '../../session/end-expired-session';
import { SessionExpiredNotice } from '../../session/session-expired-notice';
import { SiteShell } from '../../shell/site';
import {
  reloginHref,
  shouldReloadForSessionChange,
} from '@rescue-frontend/modules/session';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { useAuthSession } from '../../session/auth-session';
import { SIGN_OUT_FAILED_MESSAGE, signOutHereAsync } from './sign-out';
import { clearDraftsOnSignOut } from './sign-out-drafts';

export function PortalSiteShell({ children }: { children: ReactNode }) {
  const { status, user } = useAuthSession();
  const router = useRouter();
  const isAuthenticated = status === 'authenticated' && !!user;
  const previousSession = useRef({ status, user });

  // Signed out in another tab — from its menu, or because its session ended — or signed in there,
  // as someone else or while this tab was a guest, and this tab has read its session again. Reload
  // as handleSignOut does, without a notice: that is for the tab it ended in.
  useEffect(() => {
    const previous = previousSession.current;
    previousSession.current = { status, user };

    if (
      shouldReloadForSessionChange({
        previous,
        current: { status, user },
        signingOutHere: isSigningOutHere(),
      })
    ) {
      window.location.reload();
    }
  }, [status, user]);

  const handleSignOut = () => {
    clearDraftsOnSignOut(sessionStorageOrNull());
    void signOutHereAsync().then((outcome) => {
      if (outcome === 'still-signed-in') {
        toast.error(SIGN_OUT_FAILED_MESSAGE);
      }
    });
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
