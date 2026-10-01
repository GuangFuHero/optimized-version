import { describe, expect, it } from 'vitest';

import { isSessionExpired } from './expiry';

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
