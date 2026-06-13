import {
  refreshAsync,
  resolveGraphqlUrl,
  type ITokenPair,
} from '@rescue-frontend/data-access';
import { encode, getToken, type JWT } from 'next-auth/jwt';
import { cookies, headers } from 'next/headers';
import type { NextResponse } from 'next/server';

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

interface ResolvedBackendAuth {
  token: BackendAuthToken | null;
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
    const refreshedTokenPair = await refreshAsync({
      refresh_token: token.refreshToken,
    });

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
    return { token: null, responseCookies: [] };
  }

  if (hasUsableAccessToken(token)) {
    return {
      token,
      responseCookies: [],
    };
  }

  const refreshedToken = await refreshBackendAuthTokenAsync(token);

  if (!hasUsableAccessToken(refreshedToken)) {
    return {
      token: null,
      responseCookies: createClearedSessionCookies(request, secureCookies),
    };
  }

  return {
    token: refreshedToken,
    responseCookies: await createPersistedSessionCookiesAsync(
      request,
      refreshedToken,
      secureCookies,
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
