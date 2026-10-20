import { ApiError } from '@rescue-frontend/data-access';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { endExpiredSession } from '../../session/end-expired-session';
import { signOutHereAsync } from './sign-out';

/** The tab's own page: what it would reload or leave for. */
function fakeBrowserTab() {
  const location = { reload: vi.fn(), assign: vi.fn() };
  vi.stubGlobal('window', { location, sessionStorage: null });
  return location;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// The backend's `DELETE /auth/session` is the one thing faked: it sits across the network.
describe('signOutHereAsync', () => {
  it('reloads as a guest once the backend has ended the session', async () => {
    const location = fakeBrowserTab();

    const outcome = await signOutHereAsync(async () => undefined);

    expect(outcome).toBe('signed-out');
    expect(location.reload).toHaveBeenCalledOnce();
  });

  it('stays signed in, and says so, when the backend cannot reach its session store', async () => {
    // 503: the session may still be running, so the backend kept the cookies.
    const location = fakeBrowserTab();

    const outcome = await signOutHereAsync(async () => {
      throw new ApiError(
        503,
        'Session store unavailable',
        'session_store_unavailable',
      );
    });

    expect(outcome).toBe('still-signed-in');
    expect(location.reload).not.toHaveBeenCalled();
  });

  it('stays signed in when the backend never answers: nothing cleared the cookies', async () => {
    const location = fakeBrowserTab();

    const outcome = await signOutHereAsync(async () => {
      throw new TypeError('Failed to fetch');
    });

    expect(outcome).toBe('still-signed-in');
    expect(location.reload).not.toHaveBeenCalled();
  });

  it('still reloads for a session that ends later, after a sign-out that did not go through', async () => {
    const location = fakeBrowserTab();
    await signOutHereAsync(async () => {
      throw new ApiError(
        503,
        'Session store unavailable',
        'session_store_unavailable',
      );
    });

    // The proxy's mark on a later answer (`sessionExpiryFetch`).
    endExpiredSession();

    expect(location.reload).toHaveBeenCalledOnce();
  });
});
