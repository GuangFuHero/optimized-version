'use client';

import { QueryClient, useQuery } from '@tanstack/react-query';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import { onAuthChange } from './auth-broadcast';
import { readAuthSessionAsync, type AuthSession } from './auth-session-store';
import { siteRestClient } from './site-clients';

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
 * In a query client of its own: the back office keys its client on who is signed in
 * (`apps/admin/src/app/providers.tsx`), so the session cannot live inside it. Through
 * `siteRestClient`: a session that turns out ended elsewhere reloads the tab as a guest with the
 * notice, as any other request would.
 *
 * No word either way — the backend out of reach, or the proxy unable to refresh just now (503) —
 * keeps the last answer: a signed-in person stays signed in rather than flashing to a guest. A page
 * still waiting on its first answer is shown a guest, as next-auth did, so it does not wait for good.
 */
export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const { data, isError, refetch } = useQuery(
    {
      queryKey: ['auth-session'],
      queryFn: () => readAuthSessionAsync(siteRestClient),
      retry: false,
      // Asked even when the browser says it is offline: a first check that fails shows a guest.
      networkMode: 'always',
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
    queryClient,
  );

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
