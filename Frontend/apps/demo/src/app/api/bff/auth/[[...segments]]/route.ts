import {
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
import { NextResponse, type NextRequest } from 'next/server';

import {
  applyBackendAuthResponseCookies,
  resolveBackendAuthTokenAsync,
} from '../../../../../lib/server-backend-auth';

function resolveErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '請求失敗';
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

async function requireAccessTokenAsync(request: NextRequest) {
  const resolvedAuth = await resolveBackendAuthTokenAsync({
    cookies: {
      getAll: () => request.cookies.getAll(),
    },
    headers: request.headers,
  });

  if (!resolvedAuth.token?.accessToken) {
    const unauthorizedResponse = jsonResponse({ detail: '未登入或登入已失效' }, 401);

    return {
      accessToken: undefined,
      response: applyBackendAuthResponseCookies(
        unauthorizedResponse,
        resolvedAuth,
      ),
    };
  }

  return {
    accessToken: resolvedAuth.token.accessToken,
    resolvedAuth,
  };
}

function getPathKey(segments: string[] | undefined) {
  return segments?.join('/') ?? '';
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ segments?: string[] }> },
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
    return jsonResponse({ detail: resolveErrorMessage(error) }, 400);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ segments?: string[] }> },
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
    return jsonResponse({ detail: resolveErrorMessage(error) }, 400);
  }
}
