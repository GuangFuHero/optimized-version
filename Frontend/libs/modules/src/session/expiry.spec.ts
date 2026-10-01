import { describe, expect, it } from 'vitest';

import {
  isSessionExpired,
  isSessionExpiredResponse,
  markSessionExpired,
  takeSessionExpired,
  type FlagStorage,
} from './expiry';

/** sessionStorage as far as the flag uses it. */
function memoryStorage(): FlagStorage {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  };
}

/** A private window or blocked site data: every call throws. */
const throwingStorage: FlagStorage = {
  getItem: () => {
    throw new Error('denied');
  },
  setItem: () => {
    throw new Error('denied');
  },
  removeItem: () => {
    throw new Error('denied');
  },
};

describe('isSessionExpiredResponse', () => {
  it('reads the mark the proxy puts on an ended session', () => {
    expect(
      isSessionExpiredResponse(new Headers({ 'x-wg-session': 'expired' })),
    ).toBe(true);
  });

  it('reads an unmarked response as a live session', () => {
    expect(isSessionExpiredResponse(new Headers())).toBe(false);
  });

  it('ignores any other value', () => {
    expect(
      isSessionExpiredResponse(new Headers({ 'x-wg-session': 'active' })),
    ).toBe(false);
  });
});

describe('the expired flag across the reload', () => {
  it('is read back once, then gone', () => {
    const storage = memoryStorage();

    markSessionExpired(storage);

    expect(takeSessionExpired(storage)).toBe(true);
    expect(takeSessionExpired(storage)).toBe(false);
  });

  it('is not there when nothing marked it', () => {
    expect(takeSessionExpired(memoryStorage())).toBe(false);
  });

  it('is skipped without storage: no notice, but nothing breaks', () => {
    expect(() => markSessionExpired(null)).not.toThrow();
    expect(takeSessionExpired(null)).toBe(false);
  });

  it('is skipped when the storage throws', () => {
    expect(() => markSessionExpired(throwingStorage)).not.toThrow();
    expect(takeSessionExpired(throwingStorage)).toBe(false);
  });
});

describe('isSessionExpired', () => {
  it('counts a refresh that failed, though the request then went through as a guest', () => {
    expect(
      isSessionExpired({
        refreshFailed: true,
        sentToken: false,
        backendStatus: 200,
      }),
    ).toBe(true);
  });

  it('counts a 401 for a request that carried a token: the session was ended elsewhere', () => {
    expect(
      isSessionExpired({
        refreshFailed: false,
        sentToken: true,
        backendStatus: 401,
      }),
    ).toBe(true);
  });

  it('leaves a signed-in request that went through alone', () => {
    expect(
      isSessionExpired({
        refreshFailed: false,
        sentToken: true,
        backendStatus: 200,
      }),
    ).toBe(false);
  });

  it('does not read a 403 as expiry: signed in, just not allowed', () => {
    expect(
      isSessionExpired({
        refreshFailed: false,
        sentToken: true,
        backendStatus: 403,
      }),
    ).toBe(false);
  });

  it('does not read a server error as expiry', () => {
    expect(
      isSessionExpired({
        refreshFailed: false,
        sentToken: true,
        backendStatus: 500,
      }),
    ).toBe(false);
  });

  it('does not end a session a guest never had', () => {
    expect(
      isSessionExpired({
        refreshFailed: false,
        sentToken: false,
        backendStatus: 401,
      }),
    ).toBe(false);
  });
});
