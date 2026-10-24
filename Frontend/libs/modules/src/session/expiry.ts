/**
 * When a signed-in session has ended without the person signing out: revoked elsewhere (另一台裝置
 * 「登出所有裝置」, an admin's sign-out, an identity removed — backend ADR-096) or past its refresh.
 * The GraphQL proxy decides and marks the response; the browser reads the mark.
 *
 * Pure and import-free: the server route and the browser both use it.
 */

/** The response header the proxy marks an ended session with. */
export const SESSION_HEADER = 'x-wg-session';
export const SESSION_EXPIRED = 'expired';

/**
 * The login page, set to come back here afterwards: path and query, which carry the page's state
 * (the open ticket, A's `claim=`, B's `help=`). Read from `window.location` in a handler, not
 * while rendering (A's `a4ee3ea`).
 */
export function reloginHref({
  pathname,
  search,
}: Pick<Location, 'pathname' | 'search'>): string {
  const callbackUrl = encodeURIComponent(`${pathname}${search}`);
  return `/login?callbackUrl=${callbackUrl}`;
}

/** `useAuthSession().status` (`auth-session.tsx`), spelled out so this file stays import-free. */
export type SessionStatus = 'authenticated' | 'unauthenticated' | 'loading';

/** What the reload rule reads of `useAuthSession()`. */
export interface SessionSeen {
  status: SessionStatus;
  user: { uuid: string } | null;
}

/**
 * The person this tab shows is no longer the one signed in — another tab signed out (on its own,
 * or because its session ended), signed in, or signed out and in as someone else — and this tab
 * has just read its session again (the other tab's broadcast, or a check on focus): reload, so
 * urql's cache stops showing what the last person, or the guest, was shown. A guest's results lack
 * what is the person's own: a need they already took would still offer 接這筆. A tab left in the
 * background may go straight from one person to the next without ever seeing the guest in between.
 *
 * `loading` is a page still reading its session, neither a sign-in nor a sign-out. The tab that
 * signs in is not reloaded here: the login and register pages sit outside the site shell, and it
 * loads its next page whole anyway (`continueSignedIn`).
 */
export function shouldReloadForSessionChange({
  previous,
  current,
  signingOutHere,
}: {
  previous: SessionSeen;
  current: SessionSeen;
  /** This tab started the sign-out and reloads by itself. */
  signingOutHere: boolean;
}): boolean {
  return (
    previous.status !== 'loading' &&
    current.status !== 'loading' &&
    current.user?.uuid !== previous.user?.uuid &&
    !signingOutHere
  );
}

/** The browser's side: did the proxy mark this response? */
export function isSessionExpiredResponse(
  headers: Pick<Headers, 'get'>,
): boolean {
  return headers.get(SESSION_HEADER) === SESSION_EXPIRED;
}

/** The parts of urql's `CombinedError` this looks at. */
export interface UnauthorizedCheck {
  /** Not read: an HTTP 401 and a dropped connection both have one; only `response` tells them apart. */
  networkError?: unknown;
  response?: { status?: number };
  graphQLErrors?: ReadonlyArray<{ message: string }>;
}

/**
 * A refusal for want of a valid sign-in, for the words an error shows when the proxy's mark did not
 * end the session first — a fallback: the mark normally gets there before any error shows. It
 * comes two ways:
 * - the backend's GraphQL context turns down a token it cannot validate with an HTTP 401
 *   (`get_context`, backend `graphql/context.py`), whose `{ detail }` body urql cannot read as
 *   GraphQL: it hands over a `networkError` with the `response` beside it, so this must be asked
 *   before a `networkError` is taken for a dropped connection;
 * - a request sent on as a guest reaches a resolver that needs a person (`require_authenticated`),
 *   whose `HTTPException` reads "401: <detail>" (Starlette's `__str__`) in the GraphQL errors.
 */
export function isUnauthorizedError(error: UnauthorizedCheck): boolean {
  return (
    error.response?.status === 401 ||
    (error.graphQLErrors?.[0]?.message ?? '').startsWith('401:')
  );
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
