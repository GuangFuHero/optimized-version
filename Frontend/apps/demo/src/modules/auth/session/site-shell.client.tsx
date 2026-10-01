'use client';

import type { ReactNode } from 'react';

import { SessionExpiredNotice, SiteShell } from '@rescue-frontend/modules';
import { usePathname, useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';

import { logoutAsync } from '../api/client';

export function PortalSiteShell({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const isAuthenticated = status === 'authenticated' && !!session?.user?.id;

  const handleSignOut = () => {
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

  const handleSignIn = () => {
    const currentUrl =
      typeof window === 'undefined'
        ? pathname
        : `${pathname}${window.location.search}`;

    router.push(`/login?callbackUrl=${encodeURIComponent(currentUrl)}`);
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
