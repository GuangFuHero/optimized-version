import type { components } from '@rescue-frontend/data-access/openapi';

import { forwardedCookieHeader } from './auth-cookies';
import { getBackendApiBaseUrl } from './backend-api-url';
import { REFRESHABLE_CODES } from './session-refresh';
import { SITE_REALM_HEADERS } from './site-realm';

export type CurrentUser = components['schemas']['UserResponse'];

/**
 * Who is signed in, for a page rendering on the server, from the browser's cookies. The
 * middleware has tried to refresh a spent access token by now (`refresh-before-render.ts`).
 */
export async function currentUserFromBackendAsync(
  cookieHeader: string | null,
): Promise<CurrentUser | null> {
  // Only this environment's cookies, and no refresh cookie, as the proxy sends them (ADR-326).
  const cookie = forwardedCookieHeader(cookieHeader, 'users/me');
  const headers = new Headers(SITE_REALM_HEADERS);
  if (cookie) headers.set('cookie', cookie);
  const response = await fetch(`${getBackendApiBaseUrl()}/v1/users/me`, {
    headers,
    cache: 'no-store',
  });
  if (response.status === 401 && !(await isSpentAccessTokenAsync(response))) {
    return null;
  }
  // Anything else says nothing about who is signed in — the backend out of reach, or an access
  // token the middleware could not refresh just now: the page fails rather than sending a
  // signed-in person to the login page as if they were a guest.
  if (!response.ok) {
    throw new Error(`/users/me answered ${response.status}`);
  }

  return (await response.json()) as CurrentUser;
}

async function isSpentAccessTokenAsync(response: Response): Promise<boolean> {
  try {
    const body: unknown = await response.clone().json();
    return (
      typeof body === 'object' &&
      body !== null &&
      'code' in body &&
      REFRESHABLE_CODES.has(body.code)
    );
  } catch {
    return false;
  }
}
