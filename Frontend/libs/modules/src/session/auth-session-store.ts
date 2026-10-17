import type { IUser } from '@rescue-frontend/data-access';

import type { SessionStatus } from './expiry';

/** Who is signed in, as far as the pages need to know: the menu's name, a claim's or request's owner. */
export type AuthSessionUser = Pick<IUser, 'uuid' | 'name'>;

export interface AuthSession {
  status: SessionStatus;
  user: AuthSessionUser | null;
}

const ME_URL = '/api/v1/users/me';

/**
 * The browser's sign-in state, read from the backend's `/users/me` through the app's own proxy
 * (which refreshes a spent access token on the way, F1). Since the login moved to the backend the
 * cookies are `HttpOnly`: asking the backend is the only way a page can tell.
 *
 * Kept apart from react-query: the back office keys its query client on who is signed in
 * (`apps/admin/src/app/providers.tsx`), so the session cannot live inside it.
 */
export function createAuthSessionStore(fetchMe: typeof fetch) {
  let session: AuthSession = { status: 'loading', user: null };

  /**
   * No word either way — the backend out of reach, or the proxy unable to refresh just now (503):
   * a signed-in person stays signed in rather than flashing to a guest. A page still waiting on
   * its first answer is shown a guest, as next-auth did, so it does not wait for good.
   */
  const keepUnlessLoading = () => {
    if (session.status === 'loading') {
      session = { status: 'unauthenticated', user: null };
    }
  };

  const checkAsync = async () => {
    let response: Response;
    try {
      response = await fetchMe(ME_URL, { cache: 'no-store' });
    } catch {
      keepUnlessLoading();
      return;
    }

    if (response.status === 401) {
      session = { status: 'unauthenticated', user: null };
      return;
    }

    if (!response.ok) {
      keepUnlessLoading();
      return;
    }

    const user = (await response.json()) as IUser;
    session = {
      status: 'authenticated',
      user: { uuid: user.uuid, name: user.name },
    };
  };

  let inFlight: Promise<void> | null = null;
  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => session,

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /** Reads the session again. Checks asked for while one is on its way share its answer. */
    refetch(): Promise<void> {
      inFlight ??= (async () => {
        const before = session;
        try {
          await checkAsync();
        } finally {
          inFlight = null;
        }
        if (session !== before) {
          for (const listener of listeners) listener();
        }
      })();
      return inFlight;
    },
  };
}
