import { describe, expect, it } from 'vitest';

import { ApiError } from '@rescue-frontend/data-access';

import {
  addContactErrorMessage,
  buildAccountStepUpHref,
  lineReturnError,
  readAccountStepUpReturn,
  readStepUpRequired,
  setPasswordErrorMessage,
  stripAccountStepUpReturn,
} from './account-step-up';

const refusal = (status: number, code: string, message = '') =>
  new ApiError(status, message, code);

describe('readStepUpRequired', () => {
  it('asks for the code the backend just sent, in words for a box rather than an API field', () => {
    expect(
      readStepUpRequired(
        '已將設定密碼的驗證碼寄至您帳號的聯絡方式，請填入 step_up.old_channel_code',
      ),
    ).toEqual({
      kind: 'old-code',
      message:
        '已將設定密碼的驗證碼寄至您帳號的聯絡方式，請在下面輸入那組驗證碼',
    });
  });

  it('asks for the code already on its way, without sending another', () => {
    const pending =
      '新增聯絡方式的驗證碼已寄至您帳號的聯絡方式，請使用先前收到的那一組';

    expect(readStepUpRequired(pending)).toEqual({
      kind: 'old-code',
      message: pending,
    });
  });

  it('asks a password account for its password', () => {
    expect(readStepUpRequired('新增聯絡方式需要輸入密碼')).toEqual({
      kind: 'password',
    });
  });

  it('says why a provider the browser cannot prove leaves no way here', () => {
    const ask = readStepUpRequired(
      '設定密碼需要以此帳號既有的第三方登入方式重新驗證，請填入 step_up.id_token',
    );

    expect(ask.kind).toBe('refused');
    expect(ask).toHaveProperty('message', expect.stringContaining('Google'));
    expect(ask).not.toHaveProperty(
      'message',
      expect.stringContaining('step_up'),
    );
  });

  it('passes on a refusal that asks for nothing, such as too many codes sent', () => {
    expect(readStepUpRequired('驗證碼寄送次數已達上限，請稍後再試')).toEqual({
      kind: 'refused',
      message: '驗證碼寄送次數已達上限，請稍後再試',
    });
  });
});

describe('the way to LINE and back', () => {
  it('goes to LINE for this action and comes back to the page, marked with it', () => {
    const href = new URL(
      buildAccountStepUpHref('set_password'),
      'http://site.test',
    );

    expect(href.pathname).toBe('/api/v1/auth/oauth/line/start');
    expect(Object.fromEntries(href.searchParams)).toEqual({
      purpose: 'step_up',
      action: 'set_password',
      app: 'site',
      return_to: '/account/security?resume=set_password',
    });
  });

  it('reads which action came back, and how LINE went', () => {
    expect(
      readAccountStepUpReturn(
        new URLSearchParams('resume=add_contact&step_up=ok'),
      ),
    ).toEqual({ action: 'add_contact', stepUp: 'ok' });
    expect(
      readAccountStepUpReturn(
        new URLSearchParams(
          'resume=set_password&step_up_error=oauth_cancelled',
        ),
      ),
    ).toEqual({
      action: 'set_password',
      stepUp: { error: 'oauth_cancelled' },
    });
  });

  it('reads nothing without the marker, or with one it does not know', () => {
    expect(
      readAccountStepUpReturn(new URLSearchParams('step_up=ok')),
    ).toBeNull();
    expect(
      readAccountStepUpReturn(new URLSearchParams('resume=unlink&step_up=ok')),
    ).toBeNull();
  });

  it('takes the marker off the address, so a reload does not repeat it', () => {
    expect(
      stripAccountStepUpReturn(
        '/account/security?resume=add_contact&step_up_error=step_up_invalid',
      ),
    ).toBe('/account/security');
  });

  it('says what to press again after LINE went wrong', () => {
    expect(lineReturnError('oauth_cancelled', 'set_password')).toBe(
      '已取消 LINE 驗證。要建立密碼，請再按一次「建立密碼」。',
    );
    expect(lineReturnError('something_new', 'add_contact')).toBe(
      'LINE 驗證沒有完成。要新增聯絡方式，請再按一次「發送驗證碼」。',
    );
  });
});

describe('error messages', () => {
  it('names the step a wrong proof was at, as one code covers both', () => {
    const wrong = refusal(401, 'step_up_invalid');

    expect(addContactErrorMessage(wrong, 'password')).toBe(
      '密碼不正確，請重新輸入',
    );
    expect(addContactErrorMessage(wrong, 'old-code')).toBe(
      '驗證碼不正確或已過期，請重新輸入',
    );
    expect(setPasswordErrorMessage(wrong, 'old-code')).toBe(
      '驗證碼不正確或已過期，請重新輸入',
    );
  });

  it('says a contact another account holds is taken, rather than to sign in', () => {
    expect(
      addContactErrorMessage(refusal(409, 'identifier_taken'), 'send'),
    ).toBe('這個 Email 或手機號碼已經是別的帳號在用，請換一個');
  });

  it('points an account with nothing to receive a code at adding a contact first', () => {
    expect(
      setPasswordErrorMessage(refusal(422, 'no_proof_channel'), 'send'),
    ).toContain('先在下面新增');
  });

  it('falls back to its own words for anything unknown', () => {
    expect(setPasswordErrorMessage(new Error('offline'), 'send')).toBe(
      '建立密碼失敗，請稍後再試。',
    );
    expect(addContactErrorMessage(new Error('offline'), 'code')).toBe(
      '驗證失敗，請稍後再試。',
    );
  });
});
