import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { refreshBeforeRenderAsync } from './refresh-before-render';

/** What the middleware sent to the backend, as the fake backend received it. */
interface BackendCall {
  url: URL;
  method: string;
  headers: Headers;
}

/** The backend is the one thing faked; every call is recorded, and `respond` answers it. */
function fakeBackend(
  respond: (call: BackendCall) => Response | Promise<Response> = () =>
    new Response(null, { status: 204 }),
) {
  const calls: BackendCall[] = [];

  vi.stubGlobal(
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const call = {
        url: new URL(String(input)),
        method: init?.method ?? 'GET',
        headers: new Headers(init?.headers),
      };
      calls.push(call);
      return respond(call);
    },
  );

  return calls;
}

/** An access token as the backend signs it, expiring `seconds` from now (only `exp` is read). */
function accessToken(seconds: number) {
  const part = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + seconds;

  return `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ sub: 'u-1', exp })}.signature`;
}

/** A page navigation in the browser, before the page renders. */
function openPage(path: string, cookie?: string, clientIp?: string) {
  const headers = new Headers({ accept: 'text/html' });
  if (cookie) headers.set('cookie', cookie);
  // As Cloudflare sets it, the one hop trusted for the browser's address (`resolveClientIp`).
  if (clientIp) headers.set('cf-connecting-ip', clientIp);

  return refreshBeforeRenderAsync(
    new NextRequest(`http://localhost:3000${path}`, { headers }),
  );
}

beforeEach(() => {
  vi.stubEnv('API_BASE_URL', 'http://backend:8000/api');
  vi.stubEnv('AUTH_COOKIE_PREFIX', 'wgdev');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('refresh before render', () => {
  it('lets a page through untouched while its access token has time left', async () => {
    const calls = fakeBackend();

    const response = await openPage(
      '/account/security',
      `wgdev_at=${accessToken(10 * 60)}; wgdev_rt=refresh-1`,
    );

    expect({
      backendCalls: calls.length,
      next: response.headers.get('x-middleware-next'),
      setCookies: response.headers.getSetCookie(),
    }).toEqual({ backendCalls: 0, next: '1', setCookies: [] });
  });

  it('refreshes an access token about to run out and hands the browser the new pair', async () => {
    const calls = fakeBackend(() => refreshed('access-2b', 'refresh-2b'));

    const response = await openPage(
      '/account/security',
      `wgdev_at=${accessToken(30)}; wgdev_rt=refresh-2a`,
    );

    expect({
      refreshes: calls.filter(isRefresh).length,
      setCookies: response.headers.getSetCookie(),
    }).toEqual({
      refreshes: 1,
      setCookies: [
        'wgdev_at=access-2b; Path=/; HttpOnly; SameSite=Lax',
        'wgdev_rt=refresh-2b; Path=/; HttpOnly; SameSite=Lax',
      ],
    });
  });

  it('renders the page with the new access token already', async () => {
    fakeBackend(() => refreshed('access-3b', 'refresh-3b'));

    const response = await openPage(
      '/account/security',
      `theme=dark; wgdev_at=${accessToken(-5)}; wgdev_rt=refresh-3a`,
    );

    // How Next hands the page the request headers the middleware rewrote.
    expect(response.headers.get('x-middleware-request-cookie')).toBe(
      'theme=dark; wgdev_at=access-3b; wgdev_rt=refresh-3b',
    );
  });

  it("refreshes on the browser's own rate allowance, not this server's", async () => {
    // The backend rate-limits the refresh by the first X-Forwarded-For address (§6.2).
    const calls = fakeBackend(() => refreshed('access-4b', 'refresh-4b'));

    await openPage(
      '/account/security',
      `wgdev_at=${accessToken(30)}; wgdev_rt=refresh-4a`,
      '203.0.113.4',
    );

    expect(calls.find(isRefresh)?.headers.get('x-forwarded-for')).toBe(
      '203.0.113.4',
    );
  });

  it('renders a guest whose session has ended, and clears the cookies as the backend asked', async () => {
    fakeBackend(() => refreshRefused());

    const response = await openPage(
      '/account/security',
      `theme=dark; wgdev_at=${accessToken(-5)}; wgdev_rt=refresh-5`,
    );

    expect({
      setCookies: response.headers.getSetCookie(),
      pageCookie: response.headers.get('x-middleware-request-cookie'),
    }).toEqual({
      setCookies: [
        'wgdev_at=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax',
        'wgdev_rt=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax',
      ],
      pageCookie: 'theme=dark',
    });
  });

  it('leaves the session as it is when the refresh cannot be had just now', async () => {
    // The page may get a 401 this once; the browser's own requests try again through the proxy.
    fakeBackend(() =>
      Response.json(
        { detail: 'Too many requests', code: 'rate_limited' },
        { status: 429 },
      ),
    );

    const response = await openPage(
      '/account/security',
      `wgdev_at=${accessToken(30)}; wgdev_rt=refresh-6`,
    );

    expect({
      setCookies: response.headers.getSetCookie(),
      pageCookie: response.headers.get('x-middleware-request-cookie'),
    }).toEqual({ setCookies: [], pageCookie: null });
  });

  it.each([
    ['a guest', 'theme=dark'],
    ['a refresh token alone', 'wgdev_rt=refresh-7'],
    ['an access token alone', `wgdev_at=${accessToken(-5)}`],
  ])('lets %s through without a refresh', async (_who, cookie) => {
    const calls = fakeBackend();

    await openPage('/map', cookie);

    expect(calls).toHaveLength(0);
  });

  it('leaves an access token it cannot read to the backend, which turns it down', async () => {
    const calls = fakeBackend();

    await openPage('/map', 'wgdev_at=not-a-jwt; wgdev_rt=refresh-8');

    expect(calls).toHaveLength(0);
  });
});

/** The backend's answer when the refresh token is no good: 401, and both cookies cleared (§6.2). */
function refreshRefused() {
  const headers = new Headers({ 'content-type': 'application/json' });
  headers.append(
    'set-cookie',
    'wgdev_at=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax',
  );
  headers.append(
    'set-cookie',
    'wgdev_rt=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax',
  );
  return new Response(
    JSON.stringify({
      detail: 'Invalid refresh token',
      code: 'refresh_token_invalid',
    }),
    { status: 401, headers },
  );
}

/** The backend's answer to a successful `POST /auth/session/refresh`: 204 and the new pair. */
function refreshed(access: string, refresh: string) {
  const headers = new Headers();
  headers.append(
    'set-cookie',
    `wgdev_at=${access}; Path=/; HttpOnly; SameSite=Lax`,
  );
  headers.append(
    'set-cookie',
    `wgdev_rt=${refresh}; Path=/; HttpOnly; SameSite=Lax`,
  );
  return new Response(null, { status: 204, headers });
}

function isRefresh(call: BackendCall) {
  return (
    call.method === 'POST' &&
    call.url.pathname === '/api/v1/auth/session/refresh'
  );
}
