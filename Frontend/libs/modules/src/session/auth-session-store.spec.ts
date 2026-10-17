import { describe, expect, it } from 'vitest';

import { createAuthSessionStore } from './auth-session-store';

/** The backend, through the app's own `/api/v1` proxy: the one thing faked. */
function backendAnswering(respond: () => Response | Promise<Response>) {
  const calls: string[] = [];
  const fetchFake: typeof fetch = async (input) => {
    calls.push(String(input));
    return respond();
  };
  return { fetch: fetchFake, calls };
}

function signedIn(uuid: string, name: string) {
  return Response.json({
    uuid,
    name,
    credibility_score: 0,
    created_at: '2026-10-01T00:00:00Z',
    contacts: [],
    login_methods: [],
  });
}

describe('auth session store', () => {
  it('reads a signed-in person as authenticated, by uuid and name', async () => {
    const backend = backendAnswering(() => signedIn('u-1', '王小明'));
    const store = createAuthSessionStore(backend.fetch);

    await store.refetch();

    expect(store.getSnapshot()).toEqual({
      status: 'authenticated',
      user: { uuid: 'u-1', name: '王小明' },
    });
  });

  it('reads a guest as unauthenticated', async () => {
    const backend = backendAnswering(() =>
      Response.json(
        { detail: 'Not authenticated', code: 'credentials_invalid' },
        { status: 401 },
      ),
    );
    const store = createAuthSessionStore(backend.fetch);

    await store.refetch();

    expect(store.getSnapshot()).toEqual({
      status: 'unauthenticated',
      user: null,
    });
  });

  it('stays signed in when the backend cannot be reached on a later check', async () => {
    let reachable = true;
    const backend = backendAnswering(() => {
      if (!reachable) throw new TypeError('Failed to fetch');
      return signedIn('u-3', '林小華');
    });
    const store = createAuthSessionStore(backend.fetch);
    await store.refetch();

    reachable = false;
    await store.refetch();

    expect(store.getSnapshot()).toEqual({
      status: 'authenticated',
      user: { uuid: 'u-3', name: '林小華' },
    });
  });

  it('stays signed in when the proxy cannot refresh the session just now', async () => {
    let refreshBlocked = false;
    const backend = backendAnswering(() =>
      refreshBlocked
        ? Response.json(
            { detail: '暫時無法確認登入狀態，請稍後再試一次。' },
            { status: 503 },
          )
        : signedIn('u-4', '陳大同'),
    );
    const store = createAuthSessionStore(backend.fetch);
    await store.refetch();

    refreshBlocked = true;
    await store.refetch();

    expect(store.getSnapshot()).toEqual({
      status: 'authenticated',
      user: { uuid: 'u-4', name: '陳大同' },
    });
  });

  it('shows a guest rather than loading for good when the first check cannot reach the backend', async () => {
    // As next-auth did: a page waiting on its session must not wait forever.
    const backend = backendAnswering(() => {
      throw new TypeError('Failed to fetch');
    });
    const store = createAuthSessionStore(backend.fetch);

    await store.refetch();

    expect(store.getSnapshot()).toEqual({
      status: 'unauthenticated',
      user: null,
    });
  });

  it('asks the backend once when several checks come at the same time', async () => {
    // Coming back to a tab fires `focus` and `visibilitychange` together.
    const backend = backendAnswering(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return signedIn('u-6', '張志明');
    });
    const store = createAuthSessionStore(backend.fetch);

    await Promise.all([store.refetch(), store.refetch(), store.refetch()]);

    expect(backend.calls).toHaveLength(1);
  });

  it('tells its subscribers when the session changes, and stops once they leave', async () => {
    let signedOut = false;
    const backend = backendAnswering(() =>
      signedOut
        ? Response.json({ code: 'credentials_invalid' }, { status: 401 })
        : signedIn('u-7', '黃美玲'),
    );
    const store = createAuthSessionStore(backend.fetch);
    const seen: string[] = [];
    const unsubscribe = store.subscribe(() =>
      seen.push(store.getSnapshot().status),
    );

    await store.refetch();
    unsubscribe();
    signedOut = true;
    await store.refetch();

    expect(seen).toEqual(['authenticated']);
  });
});
