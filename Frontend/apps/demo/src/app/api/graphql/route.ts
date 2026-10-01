import { getBackendGraphqlUrl } from '../../../lib/server-backend-auth';
import {
  applyBackendAuthResponseCookies,
  expireSessionResponse,
  resolveBackendAuthTokenAsync,
} from '../../../lib/server-backend-auth';
import { SITE_REALM_HEADERS } from '../../../lib/site-realm';
import { isSessionExpired } from '@rescue-frontend/modules/session';
import { NextResponse, type NextRequest } from 'next/server';

function buildForwardHeaders(request: NextRequest, accessToken?: string) {
  // Every browser-side GraphQL request of the site comes through here.
  const headers = new Headers(SITE_REALM_HEADERS);
  const contentType = request.headers.get('content-type');
  const accept = request.headers.get('accept');

  if (contentType) {
    headers.set('content-type', contentType);
  }

  if (accept) {
    headers.set('accept', accept);
  }

  if (accessToken) {
    headers.set('authorization', `Bearer ${accessToken}`);
  }

  return headers;
}

async function forwardGraphqlRequestAsync(request: NextRequest) {
  const requestLike = {
    cookies: {
      getAll: () => request.cookies.getAll(),
    },
    headers: request.headers,
  };
  const resolvedAuth = await resolveBackendAuthTokenAsync(requestLike);
  const backendGraphqlUrl = new URL(getBackendGraphqlUrl());

  backendGraphqlUrl.search = request.nextUrl.search;

  const response = await fetch(backendGraphqlUrl, {
    method: request.method,
    headers: buildForwardHeaders(
      request,
      resolvedAuth.token?.accessToken,
    ),
    body:
      request.method === 'GET' || request.method === 'HEAD'
        ? undefined
        : await request.text(),
    cache: 'no-store',
  });

  const proxiedResponse = new NextResponse(response.body, {
    status: response.status,
    headers: {
      'content-type':
        response.headers.get('content-type') ?? 'application/json',
    },
  });
  const expired = isSessionExpired({
    refreshFailed: resolvedAuth.refreshFailed,
    sentToken: Boolean(resolvedAuth.token?.accessToken),
    backendStatus: response.status,
  });

  return expired
    ? expireSessionResponse(proxiedResponse, requestLike, resolvedAuth)
    : applyBackendAuthResponseCookies(proxiedResponse, resolvedAuth);
}

export async function GET(request: NextRequest) {
  return forwardGraphqlRequestAsync(request);
}

export async function POST(request: NextRequest) {
  return forwardGraphqlRequestAsync(request);
}
