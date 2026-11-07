import { describe, expect, it } from 'vitest';

import { createRestClient } from '@rescue-frontend/data-access';

import { readAuthSessionAsync } from './auth-session-store';

/** The backend, through the app's own `/api/v1` proxy: the one thing faked. */
function backendAnswering(respond: () => Response | Promise<Response>) {
  return createRestClient({
    fetch: async () => respond(),
    baseUrl: 'http://site.test',
  });
}

describe('readAuthSessionAsync', () => {
  it('reads a signed-in person as authenticated, by uuid and name', async () => {
    const client = backendAnswering(() =>
      Response.json({
        uuid: 'u-1',
        name: '王小明',
        credibility_score: 0,
        created_at: '2026-10-01T00:00:00Z',
        contacts: [],
        login_methods: [],
      }),
    );

    await expect(readAuthSessionAsync(client)).resolves.toEqual({
      status: 'authenticated',
      user: { uuid: 'u-1', name: '王小明' },
    });
  });

  it('reads a guest as unauthenticated', async () => {
    const client = backendAnswering(() =>
      Response.json(
        { detail: 'Not authenticated', code: 'credentials_invalid' },
        { status: 401 },
      ),
    );

    await expect(readAuthSessionAsync(client)).resolves.toEqual({
      status: 'unauthenticated',
      user: null,
    });
  });

  it('gives no word either way when the proxy cannot refresh the session just now', async () => {
    const client = backendAnswering(() =>
      Response.json(
        { detail: '暫時無法確認登入狀態，請稍後再試一次。' },
        { status: 503 },
      ),
    );

    await expect(readAuthSessionAsync(client)).rejects.toThrow();
  });

  it('gives no word either way when the backend cannot be reached', async () => {
    const client = backendAnswering(() => {
      throw new TypeError('Failed to fetch');
    });

    await expect(readAuthSessionAsync(client)).rejects.toThrow();
  });
});
