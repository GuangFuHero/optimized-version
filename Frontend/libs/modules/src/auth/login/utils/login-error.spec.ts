import { describe, expect, it } from 'vitest';

import { loginErrorMessage } from './login-error';

const GENERIC_MESSAGE = '登入流程發生錯誤，請稍後再試。';

describe('loginErrorMessage', () => {
  // What the backend sends the browser back to the login page with when a Google or LINE sign-in
  // does not go through (`?error=`), from the OAuth start and from the callback.
  it.each([
    // The start
    'oauth_request_invalid',
    'origin_not_allowed',
    // The callback
    'oauth_state_invalid',
    'oauth_cancelled',
    'oauth_exchange_failed',
    'sso_token_invalid',
    'sso_email_unverified',
    'sso_email_taken',
    'sso_signin_race',
  ])('has words of its own for %s', (code) => {
    const message = loginErrorMessage(code);

    expect(message).toBeTruthy();
    expect(message).not.toBe(GENERIC_MESSAGE);
  });

  it('says something general for a code it does not know, never the code itself', () => {
    expect(loginErrorMessage('some_new_backend_code')).toBe(GENERIC_MESSAGE);
  });

  it('says nothing when the page came without an error', () => {
    expect(loginErrorMessage(null)).toBeUndefined();
  });
});
