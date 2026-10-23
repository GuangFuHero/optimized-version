import { ApiError } from '@rescue-frontend/data-access';
import { describe, expect, it } from 'vitest';

import { loginErrorMessage, passwordSignInErrorMessage } from './login-error';

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

// What `POST /auth/session` failing says on the login form, which signs the site in with the backend.
describe('passwordSignInErrorMessage', () => {
  it('reads a credentials_invalid as a wrong account or password', () => {
    const cause = new ApiError(
      401,
      'Incorrect email or password',
      'credentials_invalid',
    );

    expect(passwordSignInErrorMessage(cause)).toBe('帳號或密碼不正確。');
  });

  it('says to wait when signing in is rate-limited, not that the password is wrong', () => {
    const cause = new ApiError(429, 'Too Many Requests', 'rate_limited');

    expect(passwordSignInErrorMessage(cause)).toBe(
      '系統忙碌中，請等一分鐘後再試。',
    );
  });

  it.each([
    // An identifier past the schema's length: FastAPI's 422 carries no code.
    ['a 422', new ApiError(422, 'API request failed (422).')],
    ['no answer at all', new TypeError('Failed to fetch')],
  ])('says something general for %s', (_, cause) => {
    expect(passwordSignInErrorMessage(cause)).toBe(
      '登入失敗，請確認帳號或密碼。',
    );
  });
});
