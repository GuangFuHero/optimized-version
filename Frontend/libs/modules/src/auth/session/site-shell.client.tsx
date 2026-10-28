'use client';

import { useEffect, useRef, type ReactNode } from 'react';

import { clearApplyDraft } from '../../role-request/use-apply-draft';
import { clearAllHelpRequestDrafts } from '../../ticket/help-request';
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
import { clearContactDraft } from './use-contact-draft';

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
    // The person chose to leave, maybe on a shared device: no half-filled 請求協助 (address,
    // phone), 申請管理權限 or contact being added is left in the tab for whoever uses it next.
    // First, before the backend is asked: closing a slow tab must not keep it. A session that
    // ended keeps its drafts.
    const storage = sessionStorageOrNull();
    clearAllHelpRequestDrafts(storage);
    clearApplyDraft(storage);
    clearContactDraft(storage);
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
