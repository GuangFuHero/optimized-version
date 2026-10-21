import { describe, expect, it } from 'vitest';

import { ApiError } from '@rescue-frontend/data-access';

import {
  phoneVerifyErrorMessage,
  stepUpReturnErrorMessage,
} from './phone-verify-error';

const refusal = (status: number, code: string) =>
  new ApiError(status, 'detail', code);

describe('phoneVerifyErrorMessage', () => {
  it("says a phone another account holds in this form's words", () => {
    expect(
      phoneVerifyErrorMessage(refusal(409, 'identifier_taken'), 'send'),
    ).toBe('這支手機已經是別的帳號在用，請換一支，或用那個帳號登入申請');
  });

  it('tells a wrong password from a wrong code sent to the old contact', () => {
    expect(
      phoneVerifyErrorMessage(refusal(401, 'step_up_invalid'), 'password'),
    ).toBe('密碼不正確，請重新輸入');
    expect(
      phoneVerifyErrorMessage(refusal(401, 'step_up_invalid'), 'old-code'),
    ).toBe('驗證碼不正確或已過期，請重新輸入');
  });

  it('reads the code and its expiry', () => {
    expect(phoneVerifyErrorMessage(refusal(400, 'code_invalid'), 'code')).toBe(
      '驗證碼不正確或已過期，請重新輸入或重新傳送',
    );
    expect(
      phoneVerifyErrorMessage(refusal(404, 'no_pending_contact'), 'resend'),
    ).toBe('驗證碼已過期，請重新傳送');
  });

  it('keeps the shared copy for throttling, and a fallback for anything else', () => {
    expect(phoneVerifyErrorMessage(refusal(429, 'rate_limited'), 'send')).toBe(
      '系統忙碌中，請等一分鐘後再試。',
    );
    expect(phoneVerifyErrorMessage(new Error('offline'), 'send')).toBe(
      '傳送失敗，請稍後再試一次',
    );
  });
});

describe('stepUpReturnErrorMessage', () => {
  it('says what went wrong at LINE and what to do on the form', () => {
    expect(stepUpReturnErrorMessage('oauth_cancelled')).toBe(
      '已取消 LINE 驗證，手機還沒有驗證。',
    );
    expect(stepUpReturnErrorMessage('step_up_invalid')).toContain(
      '原本的 LINE 帳號',
    );
    expect(stepUpReturnErrorMessage('something_new')).toBe(
      'LINE 驗證沒有完成，請再傳送一次驗證碼。',
    );
  });
});
