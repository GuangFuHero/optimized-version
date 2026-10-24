import type { components } from '@rescue-frontend/data-access/openapi';

import { forwardedCookieHeader } from './auth-cookies';
import { getBackendApiBaseUrl } from './backend-api-url';
import { REFRESHABLE_CODES } from './session-refresh';
import { REALM_HEADER, type Realm } from './site-realm';

export type CurrentUser = components['schemas']['UserResponse'];

/**
 * The access token needs a refresh, and the page reads the account in the browser instead,
 * through the proxy, which refreshes it on the way and hands the browser the new cookies.
 */
export const READ_IN_BROWSER = 'read-in-browser';

/** Signed in, but with nothing besides `user`: the back office has nothing for them (ADR-329). */
export const NO_BACK_OFFICE_IDENTITY = 'no-back-office-identity';

/**
 * Who is signed in, for a page rendering on the server, from the browser's cookies.
 *
 * The middleware has tried to refresh a spent access token by now (`refresh-before-render.ts`), but
 * it goes by `exp` alone: a token still in date can be `access_token_stale` (the session switched
 * identity since it was signed, ADR-328), and a refresh can fail. Neither is refreshed here: a
 * Server Component cannot set cookies, so the browser would keep the refresh token this rotated,
 * and its next refresh, past ADR-330's 30 seconds, would read as a replay and end the session.
 */
export async function currentUserFromBackendAsync(
  cookieHeader: string | null,
  realm: 'site',
): Promise<CurrentUser | null | typeof READ_IN_BROWSER>;
export async function currentUserFromBackendAsync(
  cookieHeader: string | null,
  realm: 'admin',
): Promise<
  CurrentUser | null | typeof READ_IN_BROWSER | typeof NO_BACK_OFFICE_IDENTITY
>;
export async function currentUserFromBackendAsync(
  cookieHeader: string | null,
  realm: Realm,
): Promise<
  CurrentUser | null | typeof READ_IN_BROWSER | typeof NO_BACK_OFFICE_IDENTITY
> {
  // Only this environment's cookies, and no refresh cookie, as the proxy sends them (ADR-326).
  const cookie = forwardedCookieHeader(cookieHeader, 'users/me');
  const headers = new Headers({ [REALM_HEADER]: realm });
  if (cookie) headers.set('cookie', cookie);
  const response = await fetch(`${getBackendApiBaseUrl()}/v1/users/me`, {
    headers,
    cache: 'no-store',
  });
  if (response.status === 401) {
    return REFRESHABLE_CODES.has(await errorCodeAsync(response))
      ? READ_IN_BROWSER
      : null;
  }
  if (
    response.status === 403 &&
    (await errorCodeAsync(response)) === 'back_office_identity_required'
  ) {
    return NO_BACK_OFFICE_IDENTITY;
  }
  // Anything else says nothing about who is signed in — the backend out of reach: the page fails
  // rather than sending a signed-in person to the login page as if they were a guest.
  if (!response.ok) {
    throw new Error(`/users/me answered ${response.status}`);
  }

  return (await response.json()) as CurrentUser;
}

async function errorCodeAsync(response: Response): Promise<unknown> {
  try {
    const body: unknown = await response.json();
    return typeof body === 'object' && body !== null && 'code' in body
      ? body.code
      : undefined;
  } catch {
    return undefined;
  }
}
