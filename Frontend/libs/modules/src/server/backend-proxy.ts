import { resolveClientIp } from '@rescue-frontend/data-access/server';
import { NextResponse, type NextRequest } from 'next/server';

import { isSessionExpired } from '../session';
import { getBackendApiBaseUrl } from './backend-api-url';
import { withClientIpAsync } from './client-ip';
import {
  applyBackendAuthResponseCookies,
  expireSessionResponse,
  getBackendGraphqlUrl,
  refreshUnavailableResponse,
  resolveBackendAuthTokenAsync,
  type ResolvedBackendAuth,
} from './server-backend-auth';
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
  accessToken?: string,
) {
  const headers = new Headers(
    audience === 'site' ? SITE_REALM_HEADERS : undefined,
  );
  for (const name of ['content-type', 'accept']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
  const clientIp = resolveClientIp(request.headers);
  if (clientIp) headers.set('x-forwarded-for', clientIp);
  return headers;
}

function applySession(
  response: NextResponse,
  request: NextRequest,
  auth: ResolvedBackendAuth,
) {
  return isSessionExpired({
    refreshFailed: auth.refreshFailed,
    sentToken: Boolean(auth.token?.accessToken),
    backendStatus: response.status,
  })
    ? expireSessionResponse(response, request, auth)
    : applyBackendAuthResponseCookies(response, auth);
}

async function forwardRequest(
  request: NextRequest,
  url: URL,
  headers: Headers,
  publicMap: boolean,
) {
  url.search = request.nextUrl.search;
  const init = {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method)
      ? undefined
      : await request.arrayBuffer(),
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
    for (const name of ['content-type', 'content-disposition', 'retry-after']) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
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
      const auth = publicMap
        ? null
        : await resolveBackendAuthTokenAsync(request);
      if (auth?.refreshUnavailable) return refreshUnavailableResponse();
      const url = new URL(
        `${getBackendApiBaseUrl()}/v1/${segments.map(encodeURIComponent).join('/')}`,
      );
      const response = await forwardRequest(
        request,
        url,
        forwardHeaders(request, audience, auth?.token?.accessToken),
        publicMap,
      );
      return auth ? applySession(response, request, auth) : response;
    });
}

export function createBackendGraphqlHandler(audience: Audience) {
  return (request: NextRequest) =>
    withClientIpAsync(async () => {
      const auth = await resolveBackendAuthTokenAsync(request);
      if (auth.refreshUnavailable) return refreshUnavailableResponse();
      if (audience === 'admin' && !auth.token?.accessToken) {
        return applySession(
          NextResponse.json(
            { detail: 'Please sign in.', code: 'unauthenticated' },
            { status: 401, headers: { 'cache-control': 'no-store' } },
          ),
          request,
          auth,
        );
      }
      const response = await forwardRequest(
        request,
        new URL(getBackendGraphqlUrl()),
        forwardHeaders(request, audience, auth.token?.accessToken),
        false,
      );
      return applySession(response, request, auth);
    });
}
