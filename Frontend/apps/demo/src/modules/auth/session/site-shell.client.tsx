'use client';

import { useEffect, useRef, type ReactNode } from 'react';

import {
  isSigningOutHere,
  markSigningOutHere,
  SessionExpiredNotice,
  SiteShell,
} from '@rescue-frontend/modules';
import {
  reloginHref,
  shouldReloadForSignOut,
} from '@rescue-frontend/modules/session';
import { useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';

import { logoutAsync } from '../api/client';

export function PortalSiteShell({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isAuthenticated = status === 'authenticated' && !!session?.user?.id;
  const previousStatus = useRef(status);

  // Signed out in another tab — from its menu, or because its session ended — and next-auth has
  // told this one. Reload as handleSignOut does, without a notice (note/session-expiry-spec.md Q7).
  useEffect(() => {
    const previous = previousStatus.current;
    previousStatus.current = status;

    if (
      shouldReloadForSignOut({
        previous,
        current: status,
        signingOutHere: isSigningOutHere(),
      })
    ) {
      window.location.reload();
    }
  }, [status]);

  const handleSignOut = () => {
    // Its own reload below; the watch above must not add another.
    markSigningOutHere();
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
        userName={session?.user?.name ?? undefined}
        userImage={session?.user?.image ?? undefined}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
      >
        {children}
      </SiteShell>
      <SessionExpiredNotice />
    </>
  );
}
