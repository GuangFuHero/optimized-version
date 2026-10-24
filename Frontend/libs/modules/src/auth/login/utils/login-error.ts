import {
  messageForCode,
  resolveAuthErrorMessage,
} from '../../api/error-messages';

const LOGIN_FALLBACK_MESSAGE = '登入失敗，請確認帳號或密碼。';

// On the login form a wrong password; the shared copy reads `credentials_invalid` as a session that
// is gone, which is what it means everywhere else.
const WRONG_CREDENTIALS_MESSAGE = '帳號或密碼不正確。';

/** What signing in with a password (`POST /auth/session`) failing says on the login form. */
export function passwordSignInErrorMessage(cause: unknown) {
  return resolveAuthErrorMessage(cause, LOGIN_FALLBACK_MESSAGE, {
    credentials_invalid: WRONG_CREDENTIALS_MESSAGE,
  });
}

/**
 * Resolve the `?error=` the login page was sent back with: what the backend's Google and LINE
 * sign-in redirects back with (ADR-331).
 */
export function loginErrorMessage(errorCode: string | null) {
  if (!errorCode) {
    return undefined;
  }

  return messageForCode(errorCode) ?? '登入流程發生錯誤，請稍後再試。';
}
