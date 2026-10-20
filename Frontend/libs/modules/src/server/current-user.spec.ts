import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { currentUserFromBackendAsync, READ_IN_BROWSER } from './current-user';

/** What the page's server side sent to the backend, as the fake backend received it. */
interface BackendCall {
  url: URL;
  headers: Headers;
}

/** The backend is the one thing faked; every call is recorded, and `respond` answers it. */
function fakeBackend(respond: () => Response) {
  const calls: BackendCall[] = [];

  vi.stubGlobal(
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: new URL(String(input)),
        headers: new Headers(init?.headers),
      });
      return respond();
    },
  );

  return calls;
}

const ACCOUNT = {
  uuid: 'u-1',
  name: '王小明',
  credibility_score: 0,
  created_at: '2026-10-01T00:00:00Z',
  contacts: [
    {
      type: 'email',
      value: 'xiaoming@example.com',
      verified: true,
      created_at: '2026-10-01T00:00:00Z',
    },
  ],
  login_methods: [{ provider: 'password' }, { provider: 'google' }],
};

beforeEach(() => {
  vi.stubEnv('API_BASE_URL', 'http://backend:8000/api');
  vi.stubEnv('AUTH_COOKIE_PREFIX', 'wgdev');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('currentUserFromBackendAsync', () => {
  it('reads the signed-in account, its contacts and how it signs in', async () => {
    fakeBackend(() => Response.json(ACCOUNT));

    const user = await currentUserFromBackendAsync('wgdev_at=access-1');

    expect(user).toEqual(ACCOUNT);
  });

  it('reads a guest as nobody', async () => {
    fakeBackend(() =>
      Response.json(
        { detail: 'Not authenticated', code: 'credentials_invalid' },
        { status: 401 },
      ),
    );

    expect(await currentUserFromBackendAsync(null)).toBeNull();
  });

  it("sends the backend this environment's access cookie, nothing else", async () => {
    // Production's cookies reach the staging hosts too; the refresh cookie is for /auth/session.
    vi.stubEnv('AUTH_COOKIE_PREFIX', 'wgstg');
    const calls = fakeBackend(() => Response.json(ACCOUNT));

    await currentUserFromBackendAsync(
      'theme=dark; wg_at=production-access; wgstg_at=access-3; wgstg_rt=refresh-3',
    );

    expect(calls[0].headers.get('cookie')).toBe('wgstg_at=access-3');
  });

  it('asks as the site, whatever identity the back office switched to (ADR-289)', async () => {
    const calls = fakeBackend(() => Response.json(ACCOUNT));

    await currentUserFromBackendAsync('wgdev_at=access-5');

    expect(calls[0].headers.get('x-wg-realm')).toBe('site');
  });

  it('does not read a backend that cannot answer as a guest, which would send them to sign in', async () => {
    fakeBackend(() =>
      Response.json({ detail: 'Service unavailable' }, { status: 503 }),
    );

    await expect(
      currentUserFromBackendAsync('wgdev_at=access-4'),
    ).rejects.toThrow();
  });

  it.each(['access_token_expired', 'access_token_stale'])(
    'leaves a session whose access token is merely %s for the browser to read',
    async (code) => {
      // Expired: the middleware could not refresh it just now (rate-limited, say). Stale: still in
      // date, so the middleware never tried. Either way the session lives on, and only the proxy
      // can refresh it, handing the browser the new cookies.
      fakeBackend(() =>
        Response.json(
          { detail: 'Could not validate credentials', code },
          { status: 401 },
        ),
      );

      expect(
        await currentUserFromBackendAsync(
          'wgdev_at=access-6; wgdev_rt=refresh-6',
        ),
      ).toBe(READ_IN_BROWSER);
    },
  );
});
