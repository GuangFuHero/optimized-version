// SPDX-License-Identifier: GPL-3.0-only
'use client';

import { useCurrentUser } from '@rescue-frontend/data-access';
import { createContext, useContext, useEffect, type ReactNode } from 'react';

import { onAuthChange } from './auth-broadcast';
import { toAuthSession, type AuthSession } from './auth-session-store';

/** Until the first answer; the server cannot tell either: the cookies are the browser's. */
const LOADING: AuthSession = { status: 'loading', user: null };
const SIGNED_OUT: AuthSession = { status: 'unauthenticated', user: null };

const AuthSessionContext = createContext<AuthSession | null>(null);

/**
 * Holds who is signed in, for both apps (it takes next-auth's `SessionProvider`'s place). Reads the
 * session once the page runs, and again whenever it could have changed out of sight: another tab
 * signed in or out (`auth-broadcast.ts`), or the person comes back to this tab — next-auth's
 * refetch on focus did the same. Checks asked for together share one request.
 *
 * No word either way — the backend out of reach, or the proxy unable to refresh just now (503) —
 * keeps the last answer. On the first read, the session stays loading until the retries finish.
 */
export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const { data, isError, refetch } = useCurrentUser({ select: toAuthSession });

  useEffect(() => {
    const check = () => void refetch({ cancelRefetch: false });
    const checkIfShown = () => {
      if (document.visibilityState === 'visible') check();
    };

    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', checkIfShown);
    const stopListening = onAuthChange(check);

    return () => {
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', checkIfShown);
      stopListening();
    };
  }, [refetch]);

  return (
    <AuthSessionContext.Provider
      value={data ?? (isError ? SIGNED_OUT : LOADING)}
    >
      {children}
    </AuthSessionContext.Provider>
  );
}

/**
 * Who is signed in: `loading` until the first answer, then `authenticated` with the person's
 * `uuid` and `name`, or `unauthenticated`.
 */
export function useAuthSession(): AuthSession {
  const session = useContext(AuthSessionContext);
  if (!session) {
    throw new Error('useAuthSession needs an <AuthSessionProvider> above it.');
  }
  return session;
}
