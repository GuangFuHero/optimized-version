import { currentClientIp } from '@rescue-frontend/data-access/server';

import { createSharedRefresh } from '../session/shared-refresh';
import { authCookieNames } from './auth-cookies';
import { getBackendApiBaseUrl } from './backend-api-url';

export type SessionRefresh =
  | { kind: 'refreshed'; setCookies: string[] }
  /** The refresh token is no good: the session has ended, and the backend cleared both cookies. */
  | { kind: 'refused'; setCookies: string[] }
  /**
   * The backend could not say: rate-limited, a server error, or no answer at all. Nothing is known
   * about the session, so it is kept as it is and the next request tries again.
   */
  | { kind: 'unavailable' };

type SettledRefresh = Exclude<SessionRefresh, { kind: 'unavailable' }>;

/**
 * The 401 codes that a refresh cures (ADR-328): the access token is past its 15
 * minutes, or it names an identity the session has since switched away from (ADR-195). Any other
 * 401 — the session itself gone, a broken token, a guest — a refresh cannot help.
 */
export const REFRESHABLE_CODES: ReadonlySet<unknown> = new Set([
  'access_token_expired',
  'access_token_stale',
]);

/** Thrown inside the shared refresh so an unavailable one is not kept for the next request. */
class RefreshUnavailableError extends Error {}

/** Trades the refresh token for a new pair (ADR-325). */
async function requestRefreshAsync(
  refreshToken: string,
): Promise<SettledRefresh> {
  const headers = new Headers({
    cookie: `${authCookieNames().refresh}=${refreshToken}`,
  });
  // The refresh is rate-limited per caller; unattributed, every browser would share this server's
  // allowance. The first of the requests sharing a refresh lends its IP.
  const clientIp = currentClientIp();
  if (clientIp) headers.set('x-forwarded-for', clientIp);

  let response: Response;
  try {
    response = await fetch(
      `${getBackendApiBaseUrl()}/v1/auth/session/refresh`,
      { method: 'POST', headers, cache: 'no-store', redirect: 'manual' },
    );
  } catch {
    throw new RefreshUnavailableError();
  }

  const setCookies = response.headers.getSetCookie();
  if (response.status === 204) return { kind: 'refreshed', setCookies };
  if (response.status === 401) return { kind: 'refused', setCookies };
  throw new RefreshUnavailableError();
}

// Within a refreshed pair's first 30 seconds a request still carrying the spent token (its browser
// has not stored the new cookies yet) gets the same pair: the backend's grace period is as long
// (`REFRESH_REUSE_GRACE_SECONDS`, ADR-330), so this only saves the round trip and the rate limit.
const SHARED_REFRESH_REUSE_MS = 30_000;
const SHARED_REFRESH_KEY = '__wanguardSharedSessionRefresh';

type SharedRefresh = (refreshToken: string) => Promise<SettledRefresh>;

/**
 * One refresh per refresh token: a page's parallel requests find the access token spent together,
 * and each would otherwise refresh on its own. Kept on `globalThis` because each route handler may
 * load its own copy of this module.
 */
const sharedRefresh: SharedRefresh = ((
  globalThis as unknown as Record<string, SharedRefresh | undefined>
)[SHARED_REFRESH_KEY] ??= createSharedRefresh(requestRefreshAsync, {
  reuseForMs: SHARED_REFRESH_REUSE_MS,
}));

/**
 * Refreshes the session the refresh token belongs to. Called on the server only: by the proxy when
 * the backend says the access token is spent, and by the middleware before a page renders with one
 * about to run out.
 */
export async function refreshBackendSessionAsync(
  refreshToken: string,
): Promise<SessionRefresh> {
  try {
    return await sharedRefresh(refreshToken);
  } catch {
    return { kind: 'unavailable' };
  }
}
