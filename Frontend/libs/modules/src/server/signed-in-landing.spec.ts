import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { signedInLandingAsync } from './signed-in-landing';

/** The backend is the one thing faked; every call's headers are recorded, and `respond` answers it. */
function fakeBackend(respond: () => Response) {
  const calls: Headers[] = [];

  vi.stubGlobal(
    'fetch',
    async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(new Headers(init?.headers));
      return respond();
    },
  );

  return calls;
}

function backendError(status: number, code: string) {
  return () => Response.json({ detail: code, code }, { status });
}

const ACCOUNT = {
  uuid: 'u-1',
  name: '王小明',
  credibility_score: 0,
  created_at: '2026-10-01T00:00:00Z',
};

beforeEach(() => {
  vi.stubEnv('API_BASE_URL', 'http://backend:8000/api');
  vi.stubEnv('AUTH_COOKIE_PREFIX', 'wgdev');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('signedInLandingAsync', () => {
  it('sends whoever the back office answers for into the back office', async () => {
    fakeBackend(() => Response.json(ACCOUNT));

    expect(await signedInLandingAsync('wgdev_at=access-1')).toBe('/admin');
  });

  it('asks as the back office does, with the access cookie (ADR-329)', async () => {
    const calls = fakeBackend(() => Response.json(ACCOUNT));

    await signedInLandingAsync('wgdev_at=access-2; wgdev_rt=refresh-2');

    expect(calls[0].get('x-wg-realm')).toBe('admin');
    expect(calls[0].get('cookie')).toBe('wgdev_at=access-2');
  });

  it('sends an account with nothing besides `user` to the map, not to the no-access page', async () => {
    fakeBackend(backendError(403, 'back_office_identity_required'));

    expect(await signedInLandingAsync('wgdev_at=access-3')).toBe('/map');
  });

  it('sends a guest to the map', async () => {
    fakeBackend(backendError(401, 'credentials_invalid'));

    expect(await signedInLandingAsync(null)).toBe('/map');
  });

  it('sends a session only the browser can refresh to the map, which works for everyone', async () => {
    fakeBackend(backendError(401, 'access_token_stale'));

    expect(await signedInLandingAsync('wgdev_at=access-4')).toBe('/map');
  });

  it('sends the person to the map when the backend cannot answer', async () => {
    fakeBackend(() =>
      Response.json({ detail: 'Service unavailable' }, { status: 503 }),
    );

    expect(await signedInLandingAsync('wgdev_at=access-5')).toBe('/map');
  });
});
