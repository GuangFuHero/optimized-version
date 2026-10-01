import {
  refreshAsync,
  resolveGraphqlUrl,
  type ITokenPair,
} from '@rescue-frontend/data-access';
import {
  SESSION_EXPIRED,
  SESSION_HEADER,
} from '@rescue-frontend/modules/session';
import { encode, getToken, type JWT } from 'next-auth/jwt';
import { cookies, headers } from 'next/headers';
import type { NextResponse } from 'next/server';

import { withClientIpAsync } from './client-ip';

export const AUTH_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const ACCESS_TOKEN_REFRESH_BUFFER_MS = 30_000;
const ALLOWED_COOKIE_SIZE = 4096;
const ESTIMATED_EMPTY_COOKIE_SIZE = 163;
const SESSION_COOKIE_CHUNK_SIZE =
  ALLOWED_COOKIE_SIZE - ESTIMATED_EMPTY_COOKIE_SIZE;

export interface BackendAuthToken extends JWT {
  accessToken?: string;
  refreshToken?: string;
  tokenType?: string;
  expiresIn?: number;
  accessTokenExpiresAt?: number;
  authError?: 'RefreshAccessTokenError';
}

interface RequestLike {
  cookies: {
    getAll(): Array<{ name: string; value: string }>;
  };
  headers: Headers;
}

interface CookieOptions {
  httpOnly: boolean;
  sameSite: 'lax';
  path: string;
  secure: boolean;
  expires?: Date;
  maxAge?: number;
}

export interface ResolvedBackendAuth {
  token: BackendAuthToken | null;
  /** There was a session, its access token could not be refreshed, and it has been cleared. */
  refreshFailed: boolean;
  responseCookies: Array<{
    name: string;
    value: string;
    options: CookieOptions;
  }>;
}

function createAccessTokenExpiresAt(expiresIn: number) {
  return Date.now() + expiresIn * 1000;
}

export function applyTokenPairToBackendAuthToken(
  token: BackendAuthToken,
  tokenPair: ITokenPair,
) {
  return {
    ...token,
    accessToken: tokenPair.access_token,
    refreshToken: tokenPair.refresh_token,
    tokenType: tokenPair.token_type ?? 'bearer',
    expiresIn: tokenPair.expires_in,
    accessTokenExpiresAt: createAccessTokenExpiresAt(tokenPair.expires_in),
    authError: undefined,
  } satisfies BackendAuthToken;
}

function hasUsableAccessToken(token: BackendAuthToken) {
  return (
    typeof token.accessToken === 'string' &&
    typeof token.accessTokenExpiresAt === 'number' &&
    token.accessTokenExpiresAt > Date.now() + ACCESS_TOKEN_REFRESH_BUFFER_MS
  );
}

export async function refreshBackendAuthTokenAsync(
  token: BackendAuthToken,
): Promise<BackendAuthToken> {
  if (!token.refreshToken) {
    return {
      ...token,
      authError: 'RefreshAccessTokenError',
    };
  }

  try {
    // /auth/refresh is rate-limited per caller, and refreshes fire on their own schedule as access
    // tokens age out — unattributed, they would all pile onto this container's allowance.
    const refreshedTokenPair = await withClientIpAsync(() =>
      refreshAsync({ refresh_token: token.refreshToken as string }),
    );

    return applyTokenPairToBackendAuthToken(token, refreshedTokenPair);
  } catch {
    return {
      ...token,
      authError: 'RefreshAccessTokenError',
    };
  }
}

function shouldUseSecureCookies(requestHeaders: Headers) {
  return (
    requestHeaders.get('x-forwarded-proto') === 'https' ||
    process.env.NEXTAUTH_URL?.startsWith('https://') === true ||
    Boolean(process.env.VERCEL)
  );
}

function getSessionTokenCookieName(secureCookies: boolean) {
  return secureCookies
    ? '__Secure-next-auth.session-token'
    : 'next-auth.session-token';
}

function getSessionCookieOptions(secureCookies: boolean): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: secureCookies,
  };
}

function chunkSessionCookie(params: {
  name: string;
  value: string;
  options: CookieOptions;
}) {
  const chunkCount = Math.ceil(
    params.value.length / SESSION_COOKIE_CHUNK_SIZE,
  );

  if (chunkCount <= 1) {
    return [params];
  }

  return Array.from({ length: chunkCount }, (_, index) => ({
    name: `${params.name}.${index}`,
    value: params.value.slice(
      index * SESSION_COOKIE_CHUNK_SIZE,
      (index + 1) * SESSION_COOKIE_CHUNK_SIZE,
    ),
    options: params.options,
  }));
}

async function createPersistedSessionCookiesAsync(
  request: RequestLike,
  token: BackendAuthToken,
  secureCookies: boolean,
) {
  const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;

  if (!secret) {
    throw new Error('Missing NextAuth secret');
  }

  const encodedToken = await encode({
    token,
    secret,
    maxAge: AUTH_SESSION_MAX_AGE_SECONDS,
  });
  const cookieName = getSessionTokenCookieName(secureCookies);
  const baseOptions = getSessionCookieOptions(secureCookies);
  const expiredCookies = request.cookies
    .getAll()
    .filter((cookie) => cookie.name.startsWith(cookieName))
    .map((cookie) => ({
      name: cookie.name,
      value: '',
      options: {
        ...baseOptions,
        maxAge: 0,
      },
    }));

  return [
    ...expiredCookies,
    ...chunkSessionCookie({
      name: cookieName,
      value: encodedToken,
      options: {
        ...baseOptions,
        expires: new Date(Date.now() + AUTH_SESSION_MAX_AGE_SECONDS * 1000),
      },
    }),
  ];
}

function createClearedSessionCookies(
  request: RequestLike,
  secureCookies: boolean,
) {
  const cookieName = getSessionTokenCookieName(secureCookies);
  const baseOptions = getSessionCookieOptions(secureCookies);
  const matchingCookies = request.cookies
    .getAll()
    .filter((cookie) => cookie.name.startsWith(cookieName));

  if (matchingCookies.length === 0) {
    return [
      {
        name: cookieName,
        value: '',
        options: {
          ...baseOptions,
          maxAge: 0,
        },
      },
    ];
  }

  return matchingCookies.map((cookie) => ({
    name: cookie.name,
    value: '',
    options: {
      ...baseOptions,
      maxAge: 0,
    },
  }));
}

export async function resolveBackendAuthTokenAsync(
  request: RequestLike,
): Promise<ResolvedBackendAuth> {
  const requestHeaders =
    request.headers instanceof Headers ? request.headers : new Headers(request.headers);
  const secureCookies = shouldUseSecureCookies(requestHeaders);
  const token = (await getToken({
    req: request as Parameters<typeof getToken>[0]['req'],
    secureCookie: secureCookies,
  })) as BackendAuthToken | null;

  if (!token) {
    return { token: null, refreshFailed: false, responseCookies: [] };
  }

  if (hasUsableAccessToken(token)) {
    return {
      token,
      refreshFailed: false,
      responseCookies: [],
    };
  }

  const refreshedToken = await refreshBackendAuthTokenAsync(token);

  if (!hasUsableAccessToken(refreshedToken)) {
    return {
      token: null,
      refreshFailed: true,
      responseCookies: createClearedSessionCookies(request, secureCookies),
    };
  }

  return {
    token: refreshedToken,
    refreshFailed: false,
    responseCookies: await createPersistedSessionCookiesAsync(
      request,
      refreshedToken,
      secureCookies,
    ),
  };
}

/**
 * The same session once the backend has refused its token with a 401: ended elsewhere (另一台裝置
 * 「登出所有裝置」, an admin, an identity removed — backend ADR-096). Cleared the way a failed
 * refresh clears it, so the next request goes as a guest.
 */
function expireBackendAuth(
  request: RequestLike,
  resolvedAuth: ResolvedBackendAuth,
): ResolvedBackendAuth {
  const requestHeaders =
    request.headers instanceof Headers
      ? request.headers
      : new Headers(request.headers);

  return {
    ...resolvedAuth,
    token: null,
    responseCookies: createClearedSessionCookies(
      request,
      shouldUseSecureCookies(requestHeaders),
    ),
  };
}

export function applyBackendAuthResponseCookies(
  response: NextResponse,
  resolvedAuth: ResolvedBackendAuth,
) {
  for (const cookie of resolvedAuth.responseCookies) {
    response.cookies.set(
      cookie.name,
      cookie.value,
      cookie.options as Parameters<typeof response.cookies.set>[2],
    );
  }

  return response;
}

/**
 * Answers for a session that has ended (`isSessionExpired`): marks the response for the browser,
 * which signs out and reloads as a guest, and clears the session. Status and body stay as they are
 * (note/session-expiry-spec.md).
 */
export function expireSessionResponse(
  response: NextResponse,
  request: RequestLike,
  resolvedAuth: ResolvedBackendAuth,
) {
  response.headers.set(SESSION_HEADER, SESSION_EXPIRED);

  return applyBackendAuthResponseCookies(
    response,
    expireBackendAuth(request, resolvedAuth),
  );
}

export async function getServerBackendAccessTokenAsync() {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const resolvedAuth = await resolveBackendAuthTokenAsync({
    cookies: {
      getAll: () => cookieStore.getAll(),
    },
    headers: headerStore,
  });

  return resolvedAuth.token?.accessToken;
}

export function getBackendGraphqlUrl() {
  return resolveGraphqlUrl('server');
}
