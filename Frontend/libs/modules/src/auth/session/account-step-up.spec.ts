import { describe, expect, it } from 'vitest';

import { ApiError } from '@rescue-frontend/data-access';

import {
  addContactErrorMessage,
  addContactSteps,
  buildAccountStepUpHref,
  cannotProveHere,
  contactAddedText,
  contactsSummary,
  lineProofExpired,
  lineReturnError,
  newCodeSentText,
  oldCodeSentText,
  oldCodeStillPending,
  originalContactName,
  readAccountStepUpReturn,
  readStepUpRequired,
  replacedContact,
  replaceNotice,
  setPasswordBlocked,
  setPasswordErrorMessage,
  stripAccountStepUpReturn,
} from './account-step-up';

const refusal = (status: number, code: string, message = '') =>
  new ApiError(status, message, code);

describe('readStepUpRequired', () => {
  it('asks for the code the backend just sent to a contact the account already had', () => {
    expect(
      readStepUpRequired(
        '已將設定密碼的驗證碼寄至您帳號的聯絡方式，請填入 step_up.old_channel_code',
      ),
    ).toEqual({ kind: 'old-code', pending: false });
  });

  it('asks for the code already on its way, without sending another', () => {
    expect(
      readStepUpRequired(
        '新增聯絡方式的驗證碼已寄至您帳號的聯絡方式，請使用先前收到的那一組',
      ),
    ).toEqual({ kind: 'old-code', pending: true });
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

describe('cannotProveHere', () => {
  it('knows an account with only Google and nothing to send a code to', () => {
    expect(cannotProveHere([], [{ provider: 'google' }])).toBe(true);
  });

  it('lets through an account with a contact, a password or LINE', () => {
    expect(
      cannotProveHere(
        [{ type: 'email', value: 'wang@yahoo.com.tw', verified: true }],
        [{ provider: 'google' }],
      ),
    ).toBe(false);
    expect(
      cannotProveHere([], [{ provider: 'google' }, { provider: 'password' }]),
    ).toBe(false);
    expect(
      cannotProveHere([], [{ provider: 'google' }, { provider: 'line' }]),
    ).toBe(false);
  });
});

describe('setPasswordBlocked', () => {
  const email = { type: 'email', value: 'wang@yahoo.com.tw', verified: true };

  it('lets an account with an email or a phone set one', () => {
    expect(setPasswordBlocked([email], [{ provider: 'line' }])).toBeNull();
  });

  it('stops an account with nothing to sign in with a password by, and says to add one first', () => {
    expect(setPasswordBlocked([], [{ provider: 'line' }])).toBe(
      '要先新增電子郵件或手機，才能設密碼。以後用密碼登入時，就打你新增的電子郵件或手機。',
    );
  });

  it('says why for Google, where nothing can be added here either', () => {
    expect(setPasswordBlocked([], [{ provider: 'google' }])).toBe(
      '你是用 Google 登入，又還沒有電子郵件或手機，所以暫時不能設定。',
    );
  });
});

describe('a contact of a kind the account already has', () => {
  const email = { type: 'email', value: 'wang@yahoo.com.tw', verified: true };
  const phone = { type: 'phone', value: '+886912345678', verified: true };

  it('is the one the new contact replaces, as the account holds one of each kind', () => {
    expect(replacedContact([email, phone], 'phone')).toBe(phone);
    expect(replacedContact([email], 'phone')).toBeNull();
  });

  it('is named with its address before anything is sent', () => {
    expect(replaceNotice(email, false)).toBe(
      '換好之後，原本的 wang@yahoo.com.tw 就不能再用。',
    );
    // Only someone who signs in with this kind has to change: a password signs in with either.
    expect(replaceNotice(phone, true)).toBe(
      '換好之後，原本的 +886912345678 就不能再用。如果你是用手機登入，以後登入要打新的手機。',
    );
  });

  it('is named again where the new code is typed', () => {
    expect(newCodeSentText('email', 'new@gmail.com', null)).toBe(
      '驗證碼已經寄到你新的電子郵件 new@gmail.com。',
    );
    expect(newCodeSentText('email', 'new@gmail.com', email)).toBe(
      '驗證碼已經寄到你新的電子郵件 new@gmail.com。完成後，原本的 wang@yahoo.com.tw 就不能再用。',
    );
  });

  it('is said to be replaced once it is done', () => {
    expect(contactAddedText('email', 'new@gmail.com', false)).toBe(
      '已經新增電子郵件 new@gmail.com。',
    );
    expect(contactAddedText('email', 'new@gmail.com', true)).toBe(
      '已經把電子郵件換成 new@gmail.com。',
    );
  });
});

describe('contactsSummary', () => {
  it('names the email and the phone the account has, or says there is none yet', () => {
    expect(
      contactsSummary([
        { type: 'email', value: 'wang@yahoo.com.tw', verified: true },
      ]),
    ).toBe('電子郵件：wang@yahoo.com.tw　手機：還沒有');
    expect(contactsSummary([])).toBe('電子郵件：還沒有　手機：還沒有');
  });
});

describe('oldCodeStillPending', () => {
  it('says the first code is still good and where to look again, the spam folder for an email', () => {
    expect(oldCodeStillPending('電子郵件')).toBe(
      '剛剛寄的驗證碼 10 分鐘內都能用，不用重寄。請到你原本的電子郵件再找一下，也看看「垃圾郵件」。',
    );
    expect(oldCodeStillPending('手機')).toBe(
      '剛剛寄的驗證碼 10 分鐘內都能用，不用重寄。請到你原本的手機再找一下。',
    );
  });
});

describe('originalContactName', () => {
  it('names the contact of the same kind, which the code goes to when it is replaced', () => {
    expect(
      originalContactName(
        [
          { type: 'email', value: 'wang@yahoo.com.tw', verified: true },
          { type: 'phone', value: '+886912345678', verified: true },
        ],
        'phone',
      ),
    ).toBe('手機');
  });

  it('names the one contact there is', () => {
    expect(
      originalContactName(
        [{ type: 'email', value: 'wang@yahoo.com.tw', verified: true }],
        'phone',
      ),
    ).toBe('電子郵件');
    expect(
      originalContactName([
        { type: 'phone', value: '+886912345678', verified: true },
      ]),
    ).toBe('手機');
  });

  it('names both when the backend picks between them', () => {
    expect(
      originalContactName([
        { type: 'phone', value: '+886912345678', verified: true },
        { type: 'email', value: 'wang@yahoo.com.tw', verified: true },
      ]),
    ).toBe('電子郵件或手機');
  });
});

describe('the words for each step', () => {
  it('names the three steps of adding an email, or a phone', () => {
    expect(addContactSteps('email')).toEqual([
      '輸入新的電子郵件',
      '確認是你本人',
      '輸入新的電子郵件收到的驗證碼',
    ]);
    expect(addContactSteps('phone')[2]).toBe('輸入新的手機收到的驗證碼');
  });

  it('says where the code went without the address, until the backend names it', () => {
    expect(oldCodeSentText('電子郵件', false)).toBe(
      '為了確認是你本人，我們寄了一組驗證碼到你原本的電子郵件。',
    );
    expect(oldCodeSentText('手機', true)).toContain('請輸入那一組');
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

  it('says what happened at LINE and which button to press again', () => {
    expect(lineReturnError('oauth_cancelled', 'add_contact')).toBe(
      '你在 LINE 那邊按了取消，所以還沒新增。要再試一次，請按「寄驗證碼」。',
    );
    expect(lineReturnError('step_up_invalid', 'set_password')).toBe(
      '你剛剛登入的 LINE 不是這個帳號用的那一個，請用原本的 LINE 再試一次。',
    );
    expect(lineReturnError('oauth_exchange_failed', 'set_password')).toBe(
      '現在連不上 LINE，請等一下再按「設定密碼」。',
    );
    expect(lineReturnError('something_new', 'add_contact')).toBe(
      'LINE 那邊沒有確認成功，所以還沒新增。要再試一次，請按「寄驗證碼」。',
    );
  });

  it('says the proof ran out rather than going round again', () => {
    expect(lineProofExpired('add_contact')).toContain('「寄驗證碼」');
    expect(lineProofExpired('set_password')).toContain('「設定密碼」');
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

  it('says too many tries plainly', () => {
    expect(addContactErrorMessage(refusal(429, 'rate_limited'), 'send')).toBe(
      '嘗試太多次，請稍後再試。',
    );
  });

  it('says a contact another account holds is taken, rather than to sign in', () => {
    expect(
      addContactErrorMessage(refusal(409, 'identifier_taken'), 'send'),
    ).toBe('這個電子郵件或手機已經是別的帳號在用，請換一個');
  });

  it('points an account with nothing to receive a code at adding a contact first', () => {
    expect(
      setPasswordErrorMessage(refusal(422, 'no_proof_channel'), 'send'),
    ).toContain('先在下面新增');
    expect(
      setPasswordErrorMessage(refusal(422, 'step_up_reauth_required'), 'send'),
    ).toContain('先在下面新增');
    expect(
      setPasswordErrorMessage(refusal(409, 'password_needs_contact'), 'send'),
    ).toBe('要先新增電子郵件或手機，才能設定密碼。');
  });

  it('falls back to its own words for anything unknown', () => {
    expect(setPasswordErrorMessage(new Error('offline'), 'send')).toBe(
      '設定密碼失敗，請稍後再試。',
    );
    expect(addContactErrorMessage(new Error('offline'), 'code')).toBe(
      '驗證失敗，請稍後再試。',
    );
  });

  it('uses no English but the brand names', () => {
    const words = [
      addContactErrorMessage(refusal(409, 'identifier_taken'), 'send'),
      setPasswordErrorMessage(refusal(422, 'no_proof_channel'), 'send'),
      ...addContactSteps('email'),
    ];

    expect(words.join('')).not.toMatch(/Email|token|step_up/);
  });
});
