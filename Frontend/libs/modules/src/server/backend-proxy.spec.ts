import { encode } from 'next-auth/jwt';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createBackendGraphqlHandler,
  createBackendRestHandler,
} from './backend-proxy';

/** What the proxy sent to the backend, as the fake backend received it. */
interface BackendCall {
  url: URL;
  method: string;
  headers: Headers;
}

/**
 * The backend is the one thing faked: it sits across the network from the proxy. Every call the
 * proxy makes is recorded, and `respond` answers it.
 */
function fakeBackend(
  respond: (call: BackendCall) => Response | Promise<Response> = () =>
    Response.json({}),
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

interface BrowserRequest {
  method?: string;
  cookie?: string;
  origin?: string;
  referer?: string;
  body?: string;
}

/** A browser request to the site's `/api/v1/*` proxy route. */
function callSiteRest(path: string, init: BrowserRequest = {}) {
  const headers = new Headers({ accept: 'application/json' });
  if (init.cookie) headers.set('cookie', init.cookie);
  if (init.origin) headers.set('origin', init.origin);
  if (init.referer) headers.set('referer', init.referer);
  if (init.body) headers.set('content-type', 'application/json');

  const request = new NextRequest(`http://localhost:3000/api/v1/${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body,
  });
  const segments = new URL(request.url).pathname.split('/').slice(3);

  return createBackendRestHandler('site')(request, {
    params: Promise.resolve({ segments }),
  });
}

/** A browser request to the back office's `/api/v1/*` proxy route. */
function callAdminRest(path: string, cookie: string) {
  const request = new NextRequest(`http://localhost:3001/api/v1/${path}`, {
    headers: { accept: 'application/json', cookie },
  });
  const segments = new URL(request.url).pathname.split('/').slice(3);

  return createBackendRestHandler('admin')(request, {
    params: Promise.resolve({ segments }),
  });
}

/** A browser's GraphQL request to the site's `/api/graphql` proxy route. */
function callSiteGraphql(query: string, cookie?: string) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (cookie) headers.set('cookie', cookie);

  return createBackendGraphqlHandler('site')(
    new NextRequest('http://localhost:3000/api/graphql', {
      method: 'POST',
      headers,
      body: JSON.stringify({ query }),
    }),
  );
}

beforeEach(() => {
  vi.stubEnv('API_BASE_URL', 'http://backend:8000/api');
  vi.stubEnv('GRAPHQL_URL', 'http://backend:8000/graphql');
  vi.stubEnv('AUTH_COOKIE_PREFIX', 'wgdev');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('site REST proxy', () => {
  it('passes the browser cookies to the backend instead of a bearer token', async () => {
    const calls = fakeBackend();

    await callSiteRest('users/me', { cookie: 'wgdev_at=access-1' });

    expect(calls).toHaveLength(1);
    expect(calls[0].headers.get('cookie')).toBe('wgdev_at=access-1');
    expect(calls[0].headers.get('authorization')).toBeNull();
  });

  it("leaves the browser's other cookies behind, of no use to the backend", async () => {
    const calls = fakeBackend();

    await callSiteRest('users/me', {
      cookie: 'theme=dark; _ga=GA1.1.24; wgdev_at=access-24',
    });

    expect(calls[0].headers.get('cookie')).toBe('wgdev_at=access-24');
  });

  it('keeps the refresh cookie from every backend path outside /auth/session', async () => {
    const calls = fakeBackend();

    await callSiteRest('tickets', {
      cookie: 'wgdev_at=access-2; wgdev_rt=refresh-2',
    });

    expect(calls[0].headers.get('cookie')).toBe('wgdev_at=access-2');
  });

  it('sends the OAuth callback the state cookie its start set', async () => {
    const calls = fakeBackend(
      () => new Response(null, { status: 302, headers: { location: '/map' } }),
    );

    await callSiteRest('auth/oauth/google/callback?code=c25&state=s25', {
      cookie: 'theme=dark; wgdev_oauth=state-25',
    });

    expect(calls[0].headers.get('cookie')).toBe('wgdev_oauth=state-25');
  });

  it("keeps production's tokens out of the staging backend", async () => {
    // Production's `.wan-guard.com` cookies reach the staging hosts too (ADR-326).
    vi.stubEnv('AUTH_COOKIE_PREFIX', 'wgstg');
    const calls = fakeBackend();

    await callSiteRest('tickets', {
      cookie:
        'wg_at=production-access; wg_rt=production-refresh; wgstg_at=access-23',
    });

    expect(calls[0].headers.get('cookie')).toBe('wgstg_at=access-23');
  });

  it("falls back on the backend's own default prefix, never production's", async () => {
    // A deployment that forgot AUTH_COOKIE_PREFIX must not hand production's tokens on: the
    // backend defaults to `wgdev` for the same reason.
    vi.stubEnv('AUTH_COOKIE_PREFIX', undefined);
    const calls = fakeBackend();

    await callSiteRest('tickets', {
      cookie: 'wg_at=production-access; wgdev_at=access-26',
    });

    expect(calls[0].headers.get('cookie')).toBe('wgdev_at=access-26');
  });

  it('sends the refresh cookie on to /auth/session, which signs out by it', async () => {
    const calls = fakeBackend(() => new Response(null, { status: 204 }));

    await callSiteRest('auth/session', {
      method: 'DELETE',
      cookie: 'wgdev_at=access-3; wgdev_rt=refresh-3',
    });

    expect(calls[0].headers.get('cookie')).toBe(
      'wgdev_at=access-3; wgdev_rt=refresh-3',
    );
  });

  it("passes Origin and Referer on for the backend's cross-site check", async () => {
    const calls = fakeBackend();

    await callSiteRest('tickets', {
      method: 'POST',
      cookie: 'wgdev_at=access-4',
      origin: 'http://localhost:3000',
      referer: 'http://localhost:3000/map',
      body: '{}',
    });

    expect({
      origin: calls[0].headers.get('origin'),
      referer: calls[0].headers.get('referer'),
    }).toEqual({
      origin: 'http://localhost:3000',
      referer: 'http://localhost:3000/map',
    });
  });

  it('hands every cookie the backend sets back to the browser', async () => {
    fakeBackend(() => {
      const headers = new Headers({ 'content-type': 'application/json' });
      headers.append(
        'set-cookie',
        'wgdev_at=new-access; Path=/; HttpOnly; SameSite=Lax',
      );
      headers.append(
        'set-cookie',
        'wgdev_rt=new-refresh; Path=/; HttpOnly; SameSite=Lax',
      );
      return new Response('{}', { status: 200, headers });
    });

    const response = await callSiteRest('auth/session', {
      method: 'POST',
      origin: 'http://localhost:3000',
      body: '{"username":"avol01@mock.test","password":"hashed"}',
    });

    expect(response.headers.getSetCookie()).toEqual([
      'wgdev_at=new-access; Path=/; HttpOnly; SameSite=Lax',
      'wgdev_rt=new-refresh; Path=/; HttpOnly; SameSite=Lax',
    ]);
  });

  it("sends the browser on to where the backend's OAuth redirect points", async () => {
    const google = 'https://accounts.google.com/o/oauth2/v2/auth?state=s1';
    fakeBackend(
      () => new Response(null, { status: 302, headers: { location: google } }),
    );

    const response = await callSiteRest(
      'auth/oauth/google/start?app=site&return_to=%2Fmap',
      { referer: 'http://localhost:3000/login' },
    );

    expect({
      status: response.status,
      location: response.headers.get('location'),
    }).toEqual({ status: 302, location: google });
  });

  it('fetches public map tiles without the browser cookies, one cached copy for everyone', async () => {
    const calls = fakeBackend(
      () => new Response('png', { headers: { 'content-type': 'image/png' } }),
    );

    await callSiteRest('map/tile/osm/10/857/438', {
      cookie: 'wgdev_at=access-18; wgdev_rt=refresh-18',
    });

    expect(calls[0].headers.get('cookie')).toBeNull();
  });

  it('ignores a next-auth session left in the browser from before the move', async () => {
    vi.stubEnv('NEXTAUTH_SECRET', 'test-secret');
    const leftover = await encode({
      secret: 'test-secret',
      token: {
        sub: 'user-19',
        accessToken: 'old-bearer-19',
        refreshToken: 'old-refresh-19',
        accessTokenExpiresAt: Date.now() + 10 * 60 * 1000,
      },
    });
    const calls = fakeBackend();

    await callSiteRest('users/me', {
      cookie: `next-auth.session-token=${leftover}; wgdev_at=access-19`,
    });

    expect(calls[0].headers.get('authorization')).toBeNull();
  });
});

/** A backend answer refusing the access token with one of the 401 codes (ADR-328). */
function unauthorized(code: string) {
  return Response.json(
    { detail: 'Could not validate credentials', code },
    { status: 401 },
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

describe('site REST proxy, access token expired', () => {
  it('refreshes the session and goes through with the new access token', async () => {
    fakeBackend((call) => {
      if (isRefresh(call)) return refreshed('access-7b', 'refresh-7b');
      return call.headers.get('cookie')?.includes('wgdev_at=access-7b')
        ? Response.json({ items: ['ticket-7'] })
        : unauthorized('access_token_expired');
    });

    const response = await callSiteRest('tickets', {
      cookie: 'wgdev_at=access-7a; wgdev_rt=refresh-7a',
    });

    expect(await response.json()).toEqual({ items: ['ticket-7'] });
  });

  it('gives the browser the refreshed cookies, so its next request carries them', async () => {
    fakeBackend((call) => {
      if (isRefresh(call)) return refreshed('access-8b', 'refresh-8b');
      return call.headers.get('cookie')?.includes('wgdev_at=access-8b')
        ? Response.json({})
        : unauthorized('access_token_expired');
    });

    const response = await callSiteRest('tickets', {
      cookie: 'wgdev_at=access-8a; wgdev_rt=refresh-8a',
    });

    expect(response.headers.getSetCookie()).toEqual([
      'wgdev_at=access-8b; Path=/; HttpOnly; SameSite=Lax',
      'wgdev_rt=refresh-8b; Path=/; HttpOnly; SameSite=Lax',
    ]);
  });

  it('refreshes too when the token predates an identity switch in the back office', async () => {
    fakeBackend((call) => {
      if (isRefresh(call)) return refreshed('access-9b', 'refresh-9b');
      return call.headers.get('cookie')?.includes('wgdev_at=access-9b')
        ? Response.json({ items: ['ticket-9'] })
        : unauthorized('access_token_stale');
    });

    const response = await callSiteRest('tickets', {
      cookie: 'wgdev_at=access-9a; wgdev_rt=refresh-9a',
    });

    expect(await response.json()).toEqual({ items: ['ticket-9'] });
  });

  it("puts the resent answer's own cookies after the refresh's, so the backend's last word wins", async () => {
    // Switching identity answers with a new access cookie of its own (ADR-325).
    fakeBackend((call) => {
      if (isRefresh(call)) return refreshed('access-28b', 'refresh-28b');
      if (!call.headers.get('cookie')?.includes('wgdev_at=access-28b')) {
        return unauthorized('access_token_expired');
      }
      const headers = new Headers({ 'content-type': 'application/json' });
      headers.append(
        'set-cookie',
        'wgdev_at=access-28c; Path=/; HttpOnly; SameSite=Lax',
      );
      return new Response('{}', { status: 200, headers });
    });

    const response = await callSiteRest('auth/session/switch-identity', {
      method: 'POST',
      cookie: 'wgdev_at=access-28a; wgdev_rt=refresh-28a',
      body: '{}',
    });

    expect(response.headers.getSetCookie()).toEqual([
      'wgdev_at=access-28b; Path=/; HttpOnly; SameSite=Lax',
      'wgdev_rt=refresh-28b; Path=/; HttpOnly; SameSite=Lax',
      'wgdev_at=access-28c; Path=/; HttpOnly; SameSite=Lax',
    ]);
  });

  it.each([
    [
      'no code',
      () => Response.json({ detail: 'Unauthorized' }, { status: 401 }),
    ],
    [
      'a body that is not JSON',
      () => new Response('Unauthorized', { status: 401 }),
    ],
  ])(
    'leaves a 401 with %s alone: nothing says a refresh would help',
    async (_what, answer) => {
      const calls = fakeBackend((call) =>
        isRefresh(call) ? refreshed('access-29b', 'refresh-29b') : answer(),
      );

      const response = await callSiteRest('tickets', {
        cookie: 'wgdev_at=access-29a; wgdev_rt=refresh-29a',
      });

      expect({
        status: response.status,
        refreshes: calls.filter(isRefresh).length,
      }).toEqual({ status: 401, refreshes: 0 });
    },
  );

  it('refreshes once for a page whose requests all found the access token spent', async () => {
    const calls = fakeBackend(async (call) => {
      if (isRefresh(call)) {
        // Still in flight when the page's other requests come asking.
        await new Promise((resolve) => setTimeout(resolve, 20));
        return refreshed('access-14b', 'refresh-14b');
      }
      return call.headers.get('cookie')?.includes('wgdev_at=access-14b')
        ? Response.json({})
        : unauthorized('access_token_expired');
    });
    const cookie = 'wgdev_at=access-14a; wgdev_rt=refresh-14a';

    await Promise.all([
      callSiteRest('tickets', { cookie }),
      callSiteRest('stations', { cookie }),
      callSiteRest('users/me', { cookie }),
    ]);

    expect(calls.filter(isRefresh)).toHaveLength(1);
  });
});

/** The backend's answer to a refresh token that is no good: 401, both cookies cleared (ADR-328). */
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

describe('site REST proxy, refresh refused', () => {
  it("clears the browser's cookies as the backend asked", async () => {
    fakeBackend((call) =>
      isRefresh(call) ? refreshRefused() : unauthorized('access_token_expired'),
    );

    const response = await callSiteRest('tickets', {
      cookie: 'wgdev_at=access-10; wgdev_rt=refresh-10',
    });

    expect(response.headers.getSetCookie()).toEqual([
      'wgdev_at=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax',
      'wgdev_rt=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax',
    ]);
  });

  it('tells the browser the session has ended, so it carries on as a guest', async () => {
    fakeBackend((call) =>
      isRefresh(call) ? refreshRefused() : unauthorized('access_token_expired'),
    );

    const response = await callSiteRest('tickets', {
      cookie: 'wgdev_at=access-11; wgdev_rt=refresh-11',
    });

    expect(response.headers.get('x-wg-session')).toBe('expired');
  });
});

describe('site REST proxy, refresh unavailable', () => {
  it('answers 503 and leaves the session alone when the refresh is rate-limited', async () => {
    fakeBackend((call) =>
      isRefresh(call)
        ? Response.json(
            { detail: 'Too many requests', code: 'rate_limited' },
            { status: 429 },
          )
        : unauthorized('access_token_expired'),
    );

    const response = await callSiteRest('tickets', {
      cookie: 'wgdev_at=access-12; wgdev_rt=refresh-12',
    });

    expect({
      status: response.status,
      setCookies: response.headers.getSetCookie(),
      session: response.headers.get('x-wg-session'),
    }).toEqual({ status: 503, setCookies: [], session: null });
  });

  it('answers 503 when the refresh never gets an answer', async () => {
    fakeBackend((call) => {
      if (isRefresh(call)) throw new TypeError('fetch failed');
      return unauthorized('access_token_expired');
    });

    const response = await callSiteRest('tickets', {
      cookie: 'wgdev_at=access-13; wgdev_rt=refresh-13',
    });

    expect(response.status).toBe(503);
  });

  it('tries the refresh again on the next request', async () => {
    let refreshAnswers = 0;
    fakeBackend((call) => {
      if (isRefresh(call)) {
        refreshAnswers += 1;
        return refreshAnswers === 1
          ? Response.json({ detail: 'Service unavailable' }, { status: 503 })
          : refreshed('access-15b', 'refresh-15b');
      }
      return call.headers.get('cookie')?.includes('wgdev_at=access-15b')
        ? Response.json({ items: ['ticket-15'] })
        : unauthorized('access_token_expired');
    });
    const cookie = 'wgdev_at=access-15a; wgdev_rt=refresh-15a';

    await callSiteRest('tickets', { cookie });
    const retried = await callSiteRest('tickets', { cookie });

    expect(await retried.json()).toEqual({ items: ['ticket-15'] });
  });
});

describe('site GraphQL proxy', () => {
  it('refreshes a spent access token and goes through, like the REST proxy', async () => {
    fakeBackend((call) => {
      if (isRefresh(call)) return refreshed('access-16b', 'refresh-16b');
      return call.headers.get('cookie')?.includes('wgdev_at=access-16b')
        ? Response.json({ data: { me: { uuid: 'u-16' } } })
        : unauthorized('access_token_expired');
    });

    const response = await callSiteGraphql(
      '{ me { uuid } }',
      'wgdev_at=access-16a; wgdev_rt=refresh-16a',
    );

    expect(await response.json()).toEqual({ data: { me: { uuid: 'u-16' } } });
  });

  it("passes a guest's sign-in-required error through as it is", async () => {
    const guestError = {
      data: null,
      errors: [{ message: '401: Not authenticated' }],
    };
    fakeBackend(() => Response.json(guestError));

    const response = await callSiteGraphql('{ myClaims { uuid } }');

    expect({
      status: response.status,
      body: await response.json(),
      session: response.headers.get('x-wg-session'),
    }).toEqual({ status: 200, body: guestError, session: null });
  });
});

describe('back-office REST proxy, until its own move', () => {
  it("signs in with its next-auth bearer token alone, leaving the site's cookies and session be", async () => {
    // localhost:3000 and :3001 share cookies, and so do the staging hosts: the site's login cookies
    // reach the back office's proxy. It still signs in through next-auth until its own move, so it
    // neither sends them on nor refreshes the site's session when its bearer token is turned down.
    vi.stubEnv('NEXTAUTH_SECRET', 'test-secret');
    const session = await encode({
      secret: 'test-secret',
      token: {
        sub: 'user-27',
        accessToken: 'admin-bearer-27',
        refreshToken: 'admin-refresh-27',
        accessTokenExpiresAt: Date.now() + 10 * 60 * 1000,
      },
    });
    const calls = fakeBackend((call) =>
      isRefresh(call)
        ? refreshed('access-27b', 'refresh-27b')
        : unauthorized('access_token_stale'),
    );

    await callAdminRest(
      'tickets',
      `next-auth.session-token=${session}; wgdev_at=access-27a; wgdev_rt=refresh-27a`,
    );

    expect({
      authorization: calls[0].headers.get('authorization'),
      cookie: calls[0].headers.get('cookie'),
      refreshes: calls.filter(isRefresh).length,
    }).toEqual({
      authorization: 'Bearer admin-bearer-27',
      cookie: null,
      refreshes: 0,
    });
  });
});

describe('site proxy, session ended elsewhere', () => {
  it('tells the browser when the backend says the session is gone', async () => {
    fakeBackend(() => unauthorized('session_expired'));

    const response = await callSiteRest('tickets', {
      cookie: 'wgdev_at=access-20; wgdev_rt=refresh-20',
    });

    expect(response.headers.get('x-wg-session')).toBe('expired');
  });

  it('tells the browser when the backend can no longer accept its token', async () => {
    fakeBackend(() => unauthorized('credentials_invalid'));

    const response = await callSiteRest('tickets', {
      cookie: 'wgdev_at=access-21; wgdev_rt=refresh-21',
    });

    expect(response.headers.get('x-wg-session')).toBe('expired');
  });

  it('tells the browser when the identity its session acts as was removed', async () => {
    fakeBackend(() => unauthorized('identity_revoked'));

    const response = await callSiteRest('tickets', {
      cookie: 'wgdev_at=access-22; wgdev_rt=refresh-22',
    });

    expect(response.headers.get('x-wg-session')).toBe('expired');
  });

  it('leaves a guest alone whose browser holds other cookies but no access token', async () => {
    // The backend names a request with no token `credentials_invalid` too, without clearing
    // anything: marking it would reload the guest's page on every load.
    fakeBackend(() =>
      Response.json(
        { detail: 'Not authenticated', code: 'credentials_invalid' },
        { status: 401 },
      ),
    );

    const response = await callSiteRest('users/me', {
      // Production's `.wan-guard.com` cookies reach the staging hosts too (ADR-326).
      cookie: 'theme=dark; wg_at=access-from-production',
    });

    expect(response.headers.get('x-wg-session')).toBeNull();
  });

  it('leaves the session alone when someone signed in mistypes a password signing in again', async () => {
    // Signing in reads the password, not the cookie: the backend answers a wrong one
    // `credentials_invalid` and clears nothing, and whoever is signed in stays so.
    const calls = fakeBackend(() =>
      Response.json(
        { detail: 'Incorrect email or password', code: 'credentials_invalid' },
        { status: 401 },
      ),
    );

    const response = await callSiteRest('auth/session', {
      method: 'POST',
      cookie: 'wgdev_at=access-23; wgdev_rt=refresh-23',
      origin: 'http://localhost:3000',
      body: JSON.stringify({ username: 'a@example.com', password: 'wrong' }),
    });

    expect(response.headers.get('x-wg-session')).toBeNull();
    expect(await response.json()).toMatchObject({
      code: 'credentials_invalid',
    });
    expect(calls).toHaveLength(1);
  });

  it('tells the browser when the session ends between the refresh and the resend', async () => {
    fakeBackend((call) => {
      if (isRefresh(call)) return refreshed('access-22b', 'refresh-22b');
      return call.headers.get('cookie')?.includes('wgdev_at=access-22b')
        ? unauthorized('session_expired')
        : unauthorized('access_token_expired');
    });

    const response = await callSiteRest('tickets', {
      cookie: 'wgdev_at=access-22a; wgdev_rt=refresh-22a',
    });

    expect(response.headers.get('x-wg-session')).toBe('expired');
  });
});
