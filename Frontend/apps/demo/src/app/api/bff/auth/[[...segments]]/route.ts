import {
  ApiError,
  addContactAsync,
  changePasswordAsync,
  forgotPasswordAsync,
  getUserSaltAsync,
  googleSsoAsync,
  lineSsoAsync,
  linkGoogleAsync,
  linkLineAsync,
  logoutAllAsync,
  logoutAsync,
  registerAsync,
  resendContactAsync,
  resendVerificationAsync,
  resetPasswordAsync,
  setPasswordAsync,
  verifyAsync,
  verifyContactAsync,
} from '@rescue-frontend/data-access';
import { isSessionExpired } from '@rescue-frontend/modules/session';
import { NextResponse, type NextRequest } from 'next/server';

import {
  applyBackendAuthResponseCookies,
  expireSessionResponse,
  resolveBackendAuthTokenAsync,
  type ResolvedBackendAuth,
} from '../../../../../lib/server-backend-auth';
import { withClientIpAsync } from '../../../../../lib/client-ip';

function resolveErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '請求失敗';
}

/**
 * Forward the backend's own status and error code so the browser can tell cases apart — a 409
 * (identity already taken) from a genuine server fault. Anything without a status stays a 400.
 */
function errorResponse(error: unknown) {
  const status = error instanceof ApiError ? error.status : 400;
  const code = error instanceof ApiError ? error.code : undefined;

  return jsonResponse({ detail: resolveErrorMessage(error), code }, status);
}

function jsonResponse(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function emptyJsonResponse(status: number) {
  return NextResponse.json({}, { status });
}

function emptyResponse(status: number) {
  return new NextResponse(null, { status });
}

async function parseJsonBodyAsync<T>(request: NextRequest) {
  return (await request.json()) as T;
}

function toRequestLike(request: NextRequest) {
  return {
    cookies: {
      getAll: () => request.cookies.getAll(),
    },
    headers: request.headers,
  };
}

/**
 * The session a request sent its token with, kept for the error path: a 401 from the backend then
 * means that session has ended elsewhere (note/session-expiry-spec.md).
 */
const sentAuthByRequest = new WeakMap<NextRequest, ResolvedBackendAuth>();

async function requireAccessTokenAsync(request: NextRequest) {
  const resolvedAuth = await resolveBackendAuthTokenAsync(
    toRequestLike(request),
  );

  if (!resolvedAuth.token?.accessToken) {
    const unauthorizedResponse = jsonResponse({ detail: '未登入或登入已失效' }, 401);
    // A session whose refresh failed has ended; a guest's 401 ends nothing.
    const expired = isSessionExpired({
      refreshFailed: resolvedAuth.refreshFailed,
      sentToken: false,
      backendStatus: 401,
    });

    return {
      accessToken: undefined,
      response: expired
        ? expireSessionResponse(
            unauthorizedResponse,
            toRequestLike(request),
            resolvedAuth,
          )
        : applyBackendAuthResponseCookies(unauthorizedResponse, resolvedAuth),
    };
  }

  sentAuthByRequest.set(request, resolvedAuth);

  return {
    accessToken: resolvedAuth.token.accessToken,
    resolvedAuth,
  };
}

function getPathKey(segments: string[] | undefined) {
  return segments?.join('/') ?? '';
}

type RouteContext = { params: Promise<{ segments?: string[] }> };

export async function GET(request: NextRequest, context: RouteContext) {
  return withClientIpAsync(() => handleGetAsync(request, context));
}

export async function POST(request: NextRequest, context: RouteContext) {
  return withClientIpAsync(() => handlePostAsync(request, context));
}

async function handleGetAsync(
  request: NextRequest,
  { params }: RouteContext,
) {
  const { segments } = await params;
  const pathKey = getPathKey(segments);

  try {
    if (segments?.[0] === 'salt' && segments[1]) {
      const saltFrontend = await getUserSaltAsync(segments.slice(1).join('/'));

      return jsonResponse({ salt_frontend: saltFrontend });
    }

    return jsonResponse({ detail: `Unsupported auth GET route: ${pathKey}` }, 404);
  } catch (error) {
    return errorResponse(error);
  }
}

async function handlePostAsync(
  request: NextRequest,
  { params }: RouteContext,
) {
  const { segments } = await params;
  const pathKey = getPathKey(segments);

  try {
    switch (pathKey) {
      case 'register': {
        await registerAsync(await parseJsonBodyAsync(request));
        return emptyJsonResponse(202);
      }
      case 'verify': {
        const tokenPair = await verifyAsync(await parseJsonBodyAsync(request));
        return jsonResponse(tokenPair);
      }
      case 'resend-verification': {
        await resendVerificationAsync(await parseJsonBodyAsync(request));
        return emptyJsonResponse(202);
      }
      case 'forgot-password': {
        await forgotPasswordAsync(await parseJsonBodyAsync(request));
        return emptyJsonResponse(202);
      }
      case 'reset-password': {
        await resetPasswordAsync(await parseJsonBodyAsync(request));
        return emptyResponse(204);
      }
      case 'sso/google': {
        const tokenPair = await googleSsoAsync(await parseJsonBodyAsync(request));
        return jsonResponse(tokenPair);
      }
      case 'sso/line': {
        const tokenPair = await lineSsoAsync(await parseJsonBodyAsync(request));
        return jsonResponse(tokenPair);
      }
      case 'logout': {
        const auth = await requireAccessTokenAsync(request);

        if (auth.response) {
          return auth.response;
        }

        await logoutAsync(auth.accessToken);

        return applyBackendAuthResponseCookies(
          emptyResponse(204),
          auth.resolvedAuth,
        );
      }
      case 'logout-all': {
        const auth = await requireAccessTokenAsync(request);

        if (auth.response) {
          return auth.response;
        }

        await logoutAllAsync(auth.accessToken);

        return applyBackendAuthResponseCookies(
          emptyResponse(204),
          auth.resolvedAuth,
        );
      }
      case 'change-password': {
        const auth = await requireAccessTokenAsync(request);

        if (auth.response) {
          return auth.response;
        }

        await changePasswordAsync(
          auth.accessToken,
          await parseJsonBodyAsync(request),
        );

        return applyBackendAuthResponseCookies(
          emptyResponse(204),
          auth.resolvedAuth,
        );
      }
      case 'set-password': {
        const auth = await requireAccessTokenAsync(request);

        if (auth.response) {
          return auth.response;
        }

        await setPasswordAsync(
          auth.accessToken,
          await parseJsonBodyAsync(request),
        );

        return applyBackendAuthResponseCookies(
          emptyResponse(204),
          auth.resolvedAuth,
        );
      }
      case 'contacts': {
        const auth = await requireAccessTokenAsync(request);

        if (auth.response) {
          return auth.response;
        }

        await addContactAsync(
          auth.accessToken,
          await parseJsonBodyAsync(request),
        );

        return applyBackendAuthResponseCookies(
          emptyJsonResponse(202),
          auth.resolvedAuth,
        );
      }
      case 'contacts/verify': {
        const auth = await requireAccessTokenAsync(request);

        if (auth.response) {
          return auth.response;
        }

        await verifyContactAsync(
          auth.accessToken,
          await parseJsonBodyAsync(request),
        );

        return applyBackendAuthResponseCookies(
          jsonResponse({}, 200),
          auth.resolvedAuth,
        );
      }
      case 'contacts/resend': {
        const auth = await requireAccessTokenAsync(request);

        if (auth.response) {
          return auth.response;
        }

        await resendContactAsync(
          auth.accessToken,
          await parseJsonBodyAsync(request),
        );

        return applyBackendAuthResponseCookies(
          emptyJsonResponse(202),
          auth.resolvedAuth,
        );
      }
      case 'link/google': {
        const auth = await requireAccessTokenAsync(request);

        if (auth.response) {
          return auth.response;
        }

        await linkGoogleAsync(
          auth.accessToken,
          await parseJsonBodyAsync(request),
        );

        return applyBackendAuthResponseCookies(
          jsonResponse({}, 200),
          auth.resolvedAuth,
        );
      }
      case 'link/line': {
        const auth = await requireAccessTokenAsync(request);

        if (auth.response) {
          return auth.response;
        }

        await linkLineAsync(auth.accessToken, await parseJsonBodyAsync(request));

        return applyBackendAuthResponseCookies(
          jsonResponse({}, 200),
          auth.resolvedAuth,
        );
      }
      default:
        return jsonResponse(
          { detail: `Unsupported auth POST route: ${pathKey}` },
          404,
        );
    }
  } catch (error) {
    const response = errorResponse(error);
    const sentAuth = sentAuthByRequest.get(request);
    const expired =
      sentAuth !== undefined &&
      isSessionExpired({
        refreshFailed: false,
        sentToken: true,
        backendStatus: response.status,
      });

    return expired
      ? expireSessionResponse(response, toRequestLike(request), sentAuth)
      : response;
  }
}
