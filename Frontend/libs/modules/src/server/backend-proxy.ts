import { resolveClientIp } from '@rescue-frontend/data-access/server';
import { NextResponse, type NextRequest } from 'next/server';

import { SESSION_EXPIRED, SESSION_HEADER } from '../session';
import {
  authCookieNames,
  cookieHeaderAfter,
  cookieValue,
  forwardedCookieHeader,
} from './auth-cookies';
import { getBackendApiBaseUrl, getBackendGraphqlUrl } from './backend-api-url';
import { withClientIpAsync } from './client-ip';
import {
  REFRESHABLE_CODES,
  refreshBackendSessionAsync,
} from './session-refresh';
import { SITE_REALM_HEADERS } from './site-realm';

type Audience = 'site' | 'admin';

interface BackendRestContext {
  params: Promise<{ segments: string[] }>;
}

const MAP_CACHE_SECONDS = 7 * 24 * 60 * 60;
const MAP_STALE_SECONDS = 24 * 60 * 60;

function forwardHeaders(
  request: NextRequest,
  audience: Audience,
  backendPath: string,
  cookieHeader: string | null,
) {
  const headers = new Headers(
    audience === 'site' ? SITE_REALM_HEADERS : undefined,
  );
  // Origin and Referer: the backend refuses a cookie-authenticated write from any other site
  // (ADR-327), and it can only tell when the browser's own headers reach it.
  for (const name of ['content-type', 'accept', 'origin', 'referer']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const cookie = forwardedCookieHeader(cookieHeader, backendPath);
  if (cookie) headers.set('cookie', cookie);
  const clientIp = resolveClientIp(request.headers);
  if (clientIp) headers.set('x-forwarded-for', clientIp);
  return headers;
}

/** Read once: a request whose access token turns out spent is sent again with the same body. */
async function readBodyAsync(request: NextRequest) {
  return ['GET', 'HEAD'].includes(request.method)
    ? undefined
    : await request.arrayBuffer();
}

/**
 * The 401 codes that mean the session itself has ended (ADR-328): signed out, a password changed,
 * an admin's sign-out, an identity removed, a token the backend can no longer accept. The backend
 * clears both cookies in the same answer (ADR-328); the browser is told so it reloads as a guest.
 */
const SESSION_ENDED_CODES: ReadonlySet<unknown> = new Set([
  'session_expired',
  'credentials_invalid',
  'identity_revoked',
]);

/** The `code` of a backend 401 (`{ detail, code }`, ADR-328); nothing for any other answer. */
async function unauthorizedCodeAsync(response: Response): Promise<unknown> {
  if (response.status !== 401) return undefined;
  try {
    const body: unknown = await response.clone().json();
    return typeof body === 'object' && body !== null && 'code' in body
      ? body.code
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Puts the refresh's cookies on the resent request's answer, ahead of any it sets itself: the
 * browser stores them in order, so whatever the backend set last wins.
 */
function withSetCookiesFirst(response: NextResponse, setCookies: string[]) {
  const own = response.headers.getSetCookie();
  response.headers.delete('set-cookie');
  for (const cookie of [...setCookies, ...own]) {
    response.headers.append('set-cookie', cookie);
  }
  return response;
}

async function forwardRequest(
  request: NextRequest,
  url: URL,
  headers: Headers,
  publicMap: boolean,
  body: ArrayBuffer | undefined,
) {
  url.search = request.nextUrl.search;
  const init = {
    method: request.method,
    headers,
    body,
    redirect: 'manual',
  } satisfies RequestInit;

  try {
    const upstream = await fetch(
      url,
      publicMap
        ? { ...init, next: { revalidate: MAP_CACHE_SECONDS } }
        : { ...init, cache: 'no-store' },
    );
    const responseHeaders = new Headers();
    // `location`: the backend's OAuth start and callback answer with a redirect for the browser
    // to follow (`redirect: 'manual'` above keeps it from being followed here).
    for (const name of [
      'content-type',
      'content-disposition',
      'retry-after',
      'location',
    ]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    // One by one: `get('set-cookie')` would fold the access and refresh cookies into one line.
    for (const cookie of upstream.headers.getSetCookie()) {
      responseHeaders.append('set-cookie', cookie);
    }
    responseHeaders.set(
      'cache-control',
      publicMap && upstream.ok
        ? `public, max-age=${MAP_STALE_SECONDS}, s-maxage=${MAP_CACHE_SECONDS}, stale-while-revalidate=${MAP_STALE_SECONDS}`
        : 'no-store',
    );
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return NextResponse.json(
      { detail: 'The backend is unavailable.' },
      { status: 502, headers: { 'cache-control': 'no-store' } },
    );
  }
}

export function createBackendRestHandler(audience: Audience) {
  return (request: NextRequest, context: BackendRestContext) =>
    withClientIpAsync(async () => {
      const { segments } = await context.params;
      const publicMap =
        request.method === 'GET' &&
        segments[0] === 'map' &&
        ['tile', 'attribution'].includes(segments[1] ?? '');
      const url = new URL(
        `${getBackendApiBaseUrl()}/v1/${segments.map(encodeURIComponent).join('/')}`,
      );
      const body = await readBodyAsync(request);
      const send = (cookieHeader: string | null) =>
        forwardRequest(
          request,
          url,
          forwardHeaders(request, audience, segments.join('/'), cookieHeader),
          publicMap,
          body,
        );
      // A public tile is the same for everyone and cached once for all: it goes without cookies.
      const cookieHeader = publicMap ? null : request.headers.get('cookie');
      // Signing in reads the password, not the cookies: a wrong one is `credentials_invalid`, which
      // clears nothing, and whoever is already signed in on this browser stays so.
      const signingIn =
        request.method === 'POST' && segments.join('/') === 'auth/session';
      return signingIn
        ? send(cookieHeader)
        : sendWithRefreshAsync(cookieHeader, send);
    });
}

/**
 * Sends the request with the browser's cookies. When the backend says the access token is spent,
 * refreshes the session — once, however many requests ask together — and sends it again with the
 * new cookies, handing them to the browser along with the answer.
 */
async function sendWithRefreshAsync(
  cookieHeader: string | null,
  send: (cookieHeader: string | null) => Promise<NextResponse>,
): Promise<NextResponse> {
  const response = await send(cookieHeader);
  // A guest, whatever else the browser holds: the backend names a request without a token
  // `credentials_invalid` too (and clears nothing), and there is no session to refresh or end.
  if (
    !cookieHeader ||
    cookieValue(cookieHeader, authCookieNames().access) === undefined
  ) {
    return response;
  }

  const code = await unauthorizedCodeAsync(response);
  if (!REFRESHABLE_CODES.has(code)) {
    return markIfSessionEnded(response, code);
  }

  const refresh = await refreshBackendSessionAsync(
    cookieValue(cookieHeader, authCookieNames().refresh) ?? '',
  );
  switch (refresh.kind) {
    case 'refreshed': {
      const resent = await send(
        cookieHeaderAfter(cookieHeader, refresh.setCookies),
      );
      return withSetCookiesFirst(
        markIfSessionEnded(resent, await unauthorizedCodeAsync(resent)),
        refresh.setCookies,
      );
    }
    case 'refused':
      return withSetCookiesFirst(
        markSessionEnded(response),
        refresh.setCookies,
      );
    case 'unavailable':
      // The site reads a 503 as a dropped connection: 「連線失敗，請…再試一次」.
      return NextResponse.json(
        { detail: '暫時無法確認登入狀態，請稍後再試一次。' },
        { status: 503 },
      );
  }
}

/** Marks the answer for the browser, which reloads as a guest (`sessionExpiryFetch`). */
function markSessionEnded(response: NextResponse) {
  response.headers.set(SESSION_HEADER, SESSION_EXPIRED);
  return response;
}

function markIfSessionEnded(response: NextResponse, code: unknown) {
  return SESSION_ENDED_CODES.has(code) ? markSessionEnded(response) : response;
}

export function createBackendGraphqlHandler(audience: Audience) {
  return (request: NextRequest) =>
    withClientIpAsync(async () => {
      const body = await readBodyAsync(request);
      return sendWithRefreshAsync(
        request.headers.get('cookie'),
        (cookieHeader) =>
          forwardRequest(
            request,
            new URL(getBackendGraphqlUrl()),
            forwardHeaders(request, audience, 'graphql', cookieHeader),
            false,
            body,
          ),
      );
    });
}
