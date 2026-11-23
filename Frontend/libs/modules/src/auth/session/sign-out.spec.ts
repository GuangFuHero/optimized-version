// SPDX-License-Identifier: GPL-3.0-only
import { ApiError } from '@rescue-frontend/data-access';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  endExpiredSession,
  SESSION_ENDING_EVENT,
  unmarkSigningOutHere,
} from '../../session/end-expired-session';
import { signOutEverywhereAsync, signOutHereAsync } from './sign-out';

/** The tab's own page: what it would reload or leave for. */
function fakeBrowserTab() {
  const location = { reload: vi.fn(), assign: vi.fn() };
  vi.stubGlobal(
    'window',
    Object.assign(new EventTarget(), { location, sessionStorage: null }),
  );
  return location;
}

afterEach(() => {
  unmarkSigningOutHere();
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
    const sessionEnding = vi.fn();
    window.addEventListener(SESSION_ENDING_EVENT, sessionEnding);
    location.reload.mockImplementation(() => {
      expect(sessionEnding).toHaveBeenCalledOnce();
    });
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

// The backend's `POST /auth/logout-all` is the one thing faked.
describe('signOutEverywhereAsync', () => {
  it('leaves for the sign-in page once every session has ended', async () => {
    const location = fakeBrowserTab();

    const outcome = await signOutEverywhereAsync(async () => undefined);

    expect(outcome).toBe('signed-out');
    expect(location.assign).toHaveBeenCalledWith('/login');
  });

  it('stays on the page, unable to say how far it got, when the backend fails partway', async () => {
    // 503: the backend may have ended this session before its session store went out of reach.
    const location = fakeBrowserTab();

    const outcome = await signOutEverywhereAsync(async () => {
      throw new ApiError(
        503,
        'Session store unavailable',
        'session_store_unavailable',
      );
    });

    expect(outcome).toBe('not-confirmed');
    expect(location.assign).not.toHaveBeenCalled();
    expect(location.reload).not.toHaveBeenCalled();
  });

  it('stays on the page when the backend never answers', async () => {
    const location = fakeBrowserTab();

    const outcome = await signOutEverywhereAsync(async () => {
      throw new TypeError('Failed to fetch');
    });

    expect(outcome).toBe('not-confirmed');
    expect(location.assign).not.toHaveBeenCalled();
  });

  it('goes on as a guest, as for any ended session, when this session had already ended', async () => {
    const location = fakeBrowserTab();

    const outcome = await signOutEverywhereAsync(async () => {
      // The proxy's mark on this very answer reaches the expiry watch while the request is out;
      // it waits, and this tab is reloaded once, as a guest.
      endExpiredSession();
      throw new ApiError(401, 'Not authenticated', 'not_authenticated');
    });

    expect(outcome).toBe('session-ended');
    expect(location.reload).toHaveBeenCalledOnce();
    expect(location.assign).not.toHaveBeenCalled();
  });

  it('is not reloaded by another request ending while the sessions are being signed out', async () => {
    const location = fakeBrowserTab();

    await signOutEverywhereAsync(async () => {
      endExpiredSession();
    });

    expect(location.reload).not.toHaveBeenCalled();
    expect(location.assign).toHaveBeenCalledOnce();
    expect(location.assign).toHaveBeenCalledWith('/login');
  });
});
