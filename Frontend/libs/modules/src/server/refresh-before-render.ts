import {
  resolveClientIp,
  runWithClientIp,
} from '@rescue-frontend/data-access/server';
import { NextResponse, type NextRequest } from 'next/server';

import { authCookieNames, cookieHeaderAfter } from './auth-cookies';
import { refreshBackendSessionAsync } from './session-refresh';

/** Refreshed this long before it runs out, so the page's own requests do not find it spent. */
const REFRESH_AHEAD_MS = 60_000;

/**
 * When the access token runs out, read from the JWT's payload without checking its signature: the
 * backend checks that on every request; here it only decides whether to refresh first.
 */
function expiresAtMs(accessToken: string): number | undefined {
  const payload = accessToken.split('.')[1];
  if (!payload) return undefined;

  try {
    const { exp } = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as { exp?: unknown };
    return typeof exp === 'number' ? exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Refreshes a spent or nearly spent access token before a page renders (backend login design §12):
 * a Server Component cannot set cookies, so a page that reads the session on the server would
 * otherwise get a 401 in the minute its access token runs out. For both apps' `proxy.ts`.
 */
export async function refreshBeforeRenderAsync(
  request: NextRequest,
): Promise<NextResponse> {
  const names = authCookieNames();
  const accessToken = request.cookies.get(names.access)?.value;
  const refreshToken = request.cookies.get(names.refresh)?.value;
  const expiresAt = accessToken ? expiresAtMs(accessToken) : undefined;

  if (
    !refreshToken ||
    expiresAt === undefined ||
    expiresAt - Date.now() > REFRESH_AHEAD_MS
  ) {
    return NextResponse.next();
  }

  // Attributed to the browser: the backend rate-limits the refresh per caller, and the middleware
  // runs outside the route handlers' `withClientIpAsync`.
  const refresh = await runWithClientIp(resolveClientIp(request.headers), () =>
    refreshBackendSessionAsync(refreshToken),
  );
  if (refresh.kind === 'unavailable') {
    return NextResponse.next();
  }

  // The browser stores the new pair with this answer — or, for a session that has ended, drops
  // both — and the page rendering now reads the request as it would have been sent after: signed
  // in with the new access token, or as a guest.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(
    'cookie',
    cookieHeaderAfter(request.headers.get('cookie') ?? '', refresh.setCookies),
  );
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  for (const cookie of refresh.setCookies) {
    response.headers.append('set-cookie', cookie);
  }
  return response;
}
