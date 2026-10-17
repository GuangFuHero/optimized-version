'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { onAuthChange } from './auth-broadcast';
import { createAuthSessionStore, type AuthSession } from './auth-session-store';
import { sessionExpiryFetch } from './end-expired-session';

type AuthSessionStore = ReturnType<typeof createAuthSessionStore>;

const AuthSessionContext = createContext<AuthSessionStore | null>(null);

/** The server cannot tell: the cookies are the browser's, read through `/users/me` once it runs. */
const SERVER_SESSION: AuthSession = { status: 'loading', user: null };

/**
 * Holds who is signed in, for both apps (it takes next-auth's `SessionProvider`'s place). Reads the
 * session once the page runs, and again whenever it could have changed out of sight: another tab
 * signed in or out (`auth-broadcast.ts`), or the person comes back to this tab — next-auth's
 * refetch on focus did the same.
 *
 * Through `sessionExpiryFetch`: a session that turns out ended elsewhere reloads the tab as a guest
 * with the notice, as any other request would.
 */
export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => createAuthSessionStore(sessionExpiryFetch));

  useEffect(() => {
    const refetch = () => void store.refetch();
    const refetchIfShown = () => {
      if (document.visibilityState === 'visible') refetch();
    };

    refetch();
    window.addEventListener('focus', refetch);
    document.addEventListener('visibilitychange', refetchIfShown);
    const stopListening = onAuthChange(refetch);

    return () => {
      window.removeEventListener('focus', refetch);
      document.removeEventListener('visibilitychange', refetchIfShown);
      stopListening();
    };
  }, [store]);

  return (
    <AuthSessionContext.Provider value={store}>
      {children}
    </AuthSessionContext.Provider>
  );
}

/**
 * Who is signed in: `loading` until the first answer, then `authenticated` with the person's
 * `uuid` and `name`, or `unauthenticated`. `refetch` reads it again — after signing in here, since
 * nothing else would tell this tab.
 */
export function useAuthSession() {
  const store = useContext(AuthSessionContext);
  if (!store) {
    throw new Error('useAuthSession needs an <AuthSessionProvider> above it.');
  }

  const session = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    () => SERVER_SESSION,
  );

  return { ...session, refetch: store.refetch };
}
