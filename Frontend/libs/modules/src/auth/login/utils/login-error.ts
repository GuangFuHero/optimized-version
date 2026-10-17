import {
  messageForCode,
  resolveAuthErrorMessage,
} from '../../api/error-messages';

export const LOGIN_FALLBACK_MESSAGE = '登入失敗，請確認帳號或密碼。';

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
 * Resolve the `?error=` the login page was sent back with.
 *
 * Two vocabularies arrive on this one parameter: our backend's — what its Google and LINE sign-in
 * redirects back with (backend login design §6.5) — and next-auth's own codes, which the back
 * office signs in with until its own move to the backend login. Backend codes are tried first so a
 * classified failure keeps its meaning; a 429 used to land here as `CredentialsSignin` and be
 * reported as a wrong password.
 */
export function loginErrorMessage(errorCode: string | null) {
  if (errorCode === 'credentials_invalid') {
    return WRONG_CREDENTIALS_MESSAGE;
  }

  const backendMessage = errorCode ? messageForCode(errorCode) : undefined;

  if (backendMessage) {
    return backendMessage;
  }

  switch (errorCode) {
    // `login_failed` is what `authorize` throws when the failure carried no code of its own
    // (network, gateway, a token-less 200). Same generic copy as next-auth's own fixed code.
    case 'login_failed':
    case 'CredentialsSignin':
      return LOGIN_FALLBACK_MESSAGE;
    case 'OAuthSignin':
      return '無法啟動第三方登入流程，請稍後再試。';
    case 'OAuthCallback':
    case 'Callback':
      return '第三方登入驗證失敗，請稍後再試。';
    case 'AccessDenied':
      return '第三方帳號未通過登入驗證。';
    // next-auth used to answer these on its own error page, which `pages.error` now bypasses.
    // `Configuration` in particular was a 500 saying to check the server logs — a deployment with
    // no NEXTAUTH_SECRET must not read as an ordinary login failure.
    case 'Configuration':
      return '登入服務設定有誤，請聯絡管理員（伺服器 log 有詳細原因）。';
    case 'Verification':
      return '這個登入連結已失效或已被使用過，請重新登入。';
    case 'OAuthAccountNotLinked':
      return '這個帳號已綁定其他登入方式。';
    case 'SessionRequired':
      return '請先登入後再繼續。';
    default:
      return errorCode ? '登入流程發生錯誤，請稍後再試。' : undefined;
  }
}
