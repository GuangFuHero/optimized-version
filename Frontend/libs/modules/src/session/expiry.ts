/**
 * When a signed-in session has ended without the person signing out: revoked elsewhere (另一台裝置
 * 「登出所有裝置」, an admin's sign-out, an identity removed — backend ADR-096) or past its refresh.
 * The GraphQL proxy decides and marks the response; the browser reads the mark
 * (`note/session-expiry-spec.md`).
 *
 * Pure and import-free: the server route and the browser both use it.
 */

/** The response header the proxy marks an ended session with. */
export const SESSION_HEADER = 'x-wg-session';
export const SESSION_EXPIRED = 'expired';

export interface SessionExpiryInput {
  /** The proxy had a session but could not refresh its access token, and sent the request as a guest. */
  refreshFailed: boolean;
  /** The request went to the backend with an access token. */
  sentToken: boolean;
  backendStatus: number;
}

/**
 * A revoked token answers 401 for every request, public ones included (backend
 * `tests/test_graphql/test_session_revocation.py`). A 403 is a signed-in caller who may not do
 * this, and a guest's 401 ends nothing they had.
 */
export function isSessionExpired({
  refreshFailed,
  sentToken,
  backendStatus,
}: SessionExpiryInput): boolean {
  return refreshFailed || (sentToken && backendStatus === 401);
}

/**
 * The login page, set to come back here afterwards: path and query, which carry the page's state
 * (the open ticket, A's `claim=`, B's `help=`). Read from `window.location` in a handler, not
 * while rendering (A's `a4ee3ea`).
 */
export function reloginHref({
  pathname,
  search,
}: Pick<Location, 'pathname' | 'search'>): string {
  return `/login?callbackUrl=${encodeURIComponent(`${pathname}${search}`)}`;
}

/** next-auth's `useSession().status`, spelled out so this file stays import-free. */
export type SessionStatus = 'authenticated' | 'unauthenticated' | 'loading';

/**
 * Another tab signed out — on its own, or because its session ended — and next-auth told this one
 * (its sign-out broadcast, or a refetch on focus): reload, so urql's cache stops showing what the
 * signed-in person could see (`note/session-expiry-spec.md` Q7). Only from `authenticated`:
 * `loading` is a page still reading its session, not a sign-out.
 */
export function shouldReloadForSignOut({
  previous,
  current,
  signingOutHere,
}: {
  previous: SessionStatus;
  current: SessionStatus;
  /** This tab started the sign-out and reloads by itself. */
  signingOutHere: boolean;
}): boolean {
  return (
    previous === 'authenticated' &&
    current === 'unauthenticated' &&
    !signingOutHere
  );
}

/** The browser's side: did the proxy mark this response? */
export function isSessionExpiredResponse(
  headers: Pick<Headers, 'get'>,
): boolean {
  return headers.get(SESSION_HEADER) === SESSION_EXPIRED;
}

/** sessionStorage as far as the flag uses it. */
export type FlagStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const EXPIRED_FLAG_KEY = 'wg.sessionExpired';

/**
 * Leaves word for the page that loads after the reload, so it can say why the person is a guest
 * now. Without storage (a private window, blocked site data) the notice is skipped, nothing else.
 */
export function markSessionExpired(storage: FlagStorage | null): void {
  try {
    storage?.setItem(EXPIRED_FLAG_KEY, '1');
  } catch {
    // No notice then; the sign-out itself does not depend on it.
  }
}

/** Reads the word once: the notice is for the first page after the reload, not every one after. */
export function takeSessionExpired(storage: FlagStorage | null): boolean {
  try {
    if (storage?.getItem(EXPIRED_FLAG_KEY) !== '1') {
      return false;
    }

    storage.removeItem(EXPIRED_FLAG_KEY);
    return true;
  } catch {
    return false;
  }
}
