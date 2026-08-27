'use client';

import { AuthRequestError } from './request-async';

/**
 * User-facing Chinese copy for the backend's auth error codes.
 *
 * The backend's `detail` is English prose written for API consumers — one of them literally tells
 * the reader to call `/auth/set-password`. Showing it verbatim is what this map replaces. Anything
 * unmapped falls back to the caller's generic message rather than leaking backend text.
 *
 * Codes are defined in `Backend/app/core/api_errors.py`; add a case here when one is added there.
 */
const MESSAGE_BY_CODE: Record<string, string> = {
  // Identifiers
  identifier_invalid: '帳號格式有誤，請確認後重新輸入。',
  identifier_taken: '這個帳號已經註冊過了，請直接登入。',
  contact_type_taken: '你的帳號已經綁定過一組了，請先移除原本的再新增。',

  // Verification codes
  code_invalid: '驗證碼不正確或已過期。請重新輸入，或重新取得一組新的驗證碼。',
  registration_expired: '這次註冊已經逾時了，請返回重新註冊。',
  no_pending_registration: '這次註冊已經逾時了，請返回重新註冊。',
  no_pending_contact: '這次新增已經逾時了，請返回重新操作。',

  // Passwords and sessions
  password_not_set: '你的帳號還沒有設定密碼，請改用「建立密碼」。',
  password_already_set: '你的帳號已經設過密碼了，請改用「變更密碼」。',
  password_incorrect: '目前密碼不正確，請重新輸入。',
  credentials_invalid: '帳號或密碼不正確。',
  refresh_token_invalid: '登入已失效，請重新登入。',

  // Social login
  sso_token_invalid: '第三方登入驗證失敗，請重新試一次。',
  sso_email_unverified: '這個 Google 帳號的信箱尚未驗證，請先完成驗證再登入。',
  sso_email_taken: '這個信箱已經註冊過了。請先用原本的方式登入，再到設定裡綁定。',
  sso_already_linked: '這個帳號已經綁定過了。',
  sso_linked_elsewhere: '這個第三方帳號已經綁定到另一個帳號了。',
  sso_signin_race: '登入沒有完成，請再試一次。',

  // Throttling — the allowance is per caller IP, but anyone sharing a NAT or office network
  // shares it, so the person seeing this may not have clicked at all.
  rate_limited: '系統忙碌中，請等一分鐘後再試。',
};

/**
 * Look up the copy for a backend error code, or `undefined` if we have none for it.
 *
 * For callers holding a bare code rather than an error — next-auth hands the login page one through
 * `?error=`, having discarded the error object on the way.
 */
export function messageForCode(code: string) {
  return MESSAGE_BY_CODE[code];
}

/**
 * Resolve user-facing copy for a failed auth call.
 *
 * `overrides` lets one screen say something more specific than the shared wording — the register
 * form can point an already-taken email at Google/LINE login, which would be noise anywhere else.
 *
 * Returns `fallback` when the failure carries no code we recognise — a network error, a gateway
 * failure, or a backend case that has not been given copy yet.
 */
export function resolveAuthErrorMessage(
  error: unknown,
  fallback: string,
  overrides?: Record<string, string>,
) {
  if (error instanceof AuthRequestError && error.code) {
    return overrides?.[error.code] ?? MESSAGE_BY_CODE[error.code] ?? fallback;
  }

  return fallback;
}
