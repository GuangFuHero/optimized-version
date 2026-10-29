/**
 * What an applicant reads when verifying their phone goes wrong. The backend's codes
 * (`Backend/app/core/api_errors.py`) through the shared copy, with this form's own words where the
 * shared ones would mislead: 「請直接登入」 for a phone another account holds, say.
 */

import { resolveAuthErrorMessage } from '../auth/api/error-messages';

/** Where in the steps the refusal came: a wrong password and a wrong code share one code. */
export type PhoneVerifyStep =
  | 'send'
  | 'password'
  | 'old-code'
  | 'code'
  | 'resend';

const OVERRIDES: Record<string, string> = {
  identifier_taken:
    '這支手機已經是別的帳號在用，請換一支，或用那個帳號登入申請',
  identifier_invalid: '手機號碼格式不正確（09 開頭十碼）',
  code_invalid: '驗證碼不正確或已過期，請重新輸入或重新傳送',
  no_pending_contact: '驗證碼已過期，請重新傳送',
};

const STEP_UP_INVALID: Partial<Record<PhoneVerifyStep, string>> = {
  password: '密碼不正確，請重新輸入',
  'old-code': '驗證碼不正確或已過期，請重新輸入',
};

export function phoneVerifyErrorMessage(
  cause: unknown,
  step: PhoneVerifyStep,
): string {
  return resolveAuthErrorMessage(cause, '傳送失敗，請稍後再試一次', {
    ...OVERRIDES,
    step_up_invalid:
      STEP_UP_INVALID[step] ?? '確認身分沒有成功，請重新傳送驗證碼',
  });
}

/**
 * Coming back from LINE without the proof (`step_up_error=`, backend ADR-361 point 6). The person is
 * still signed in and the form is as they left it, so each says what to do next on the form.
 */
const STEP_UP_RETURN_ERRORS: Record<string, string> = {
  oauth_cancelled: '已取消 LINE 驗證，手機還沒有驗證。',
  step_up_invalid:
    '請用這個帳號原本的 LINE 帳號登入，並在 5 分鐘內完成，再傳送一次驗證碼。',
  oauth_exchange_failed: '暫時無法向 LINE 確認，請稍後再傳送一次驗證碼。',
  sso_token_invalid: 'LINE 驗證沒有完成，請再傳送一次驗證碼。',
  oauth_request_invalid: 'LINE 驗證沒有完成，請再傳送一次驗證碼。',
};

export function stepUpReturnErrorMessage(code: string): string {
  return (
    STEP_UP_RETURN_ERRORS[code] ?? 'LINE 驗證沒有完成，請再傳送一次驗證碼。'
  );
}
