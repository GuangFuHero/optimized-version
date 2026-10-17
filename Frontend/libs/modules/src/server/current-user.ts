import { forwardedCookieHeader } from './auth-cookies';
import { getBackendApiBaseUrl } from './backend-api-url';
import { SITE_REALM_HEADERS } from './site-realm';

/** The parts of `/users/me` a page reads on the server (backend `UserResponse`). */
export interface CurrentUser {
  uuid: string;
  name: string;
  contacts?: { type: string; value: string; verified: boolean }[];
  /** `password`, `google`, `line` (backend `users.py`). */
  login_methods?: { provider: string }[];
}

/**
 * Who is signed in, for a page rendering on the server, from the browser's cookies. The
 * middleware has refreshed a spent access token by now (`refresh-before-render.ts`).
 */
export async function currentUserFromBackendAsync(
  cookieHeader: string | null,
): Promise<CurrentUser | null> {
  // Only this environment's cookies, and no refresh cookie, as the proxy sends them (§4).
  const cookie = forwardedCookieHeader(cookieHeader, 'users/me');
  const headers = new Headers(SITE_REALM_HEADERS);
  if (cookie) headers.set('cookie', cookie);
  const response = await fetch(`${getBackendApiBaseUrl()}/v1/users/me`, {
    headers,
    cache: 'no-store',
  });
  if (response.status === 401) return null;
  // Anything else says nothing about the session: the page fails rather than sending a signed-in
  // person to the login page as if they were a guest.
  if (!response.ok) {
    throw new Error(`/users/me answered ${response.status}`);
  }

  return (await response.json()) as CurrentUser;
}
