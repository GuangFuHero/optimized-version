/**
 * The proof 帳號安全 asks for before a new way into the account: a contact added, or a first password
 * (backend `auth_contact.py`, ADR-215/220/361). The backend decides which proof from the account's
 * shape, and its 422 says so in a sentence; this reads the sentence, builds the way to LINE and back,
 * and words the failures. Ported from 申請管理權限's phone check (`role-request/use-phone-verification.ts`,
 * `apply-return.ts`, `phone-verify-error.ts`).
 */

import { stripQueryKeys, type ReturnQuery } from '../../route/return-query';
import { resolveAuthErrorMessage } from '../api/error-messages';

export const ACCOUNT_SECURITY_PATH = '/account/security';

/** The two actions here that can need the account's provider (backend `REAUTH_ACTIONS`). */
export type AccountStepUpAction = 'add_contact' | 'set_password';

const ACTIONS: readonly AccountStepUpAction[] = ['add_contact', 'set_password'];

/** What a `step_up_required` asks of the person. */
export type StepUpAsk =
  | { kind: 'password' }
  | { kind: 'old-code'; message: string }
  | { kind: 'refused'; message: string };

const OLD_CODE_FIELD = /，?請填入 step_up\.old_channel_code$/;

/**
 * The backend's sentence, read for what it asks (`_password_proof`, `_old_channel_proof`, `_sso_proof`).
 * - A code sent to a contact the account had before (or already on its way): type it here.
 * - The password.
 * - A provider token, which a browser cannot hold (ADR-331). That is an account with no contact at all and
 *   a provider the site cannot send it back to: Google, which is not one of `REAUTH_PROVIDERS` yet.
 * - Anything else, too many codes sent say, asks for nothing and is passed on.
 */
export function readStepUpRequired(detail: string): StepUpAsk {
  if (OLD_CODE_FIELD.test(detail)) {
    return {
      kind: 'old-code',
      message: detail.replace(OLD_CODE_FIELD, '，請在下面輸入那組驗證碼'),
    };
  }

  if (detail.endsWith('請使用先前收到的那一組')) {
    return { kind: 'old-code', message: detail };
  }

  if (detail.endsWith('需要輸入密碼')) {
    return { kind: 'password' };
  }

  if (detail.includes('step_up.id_token')) {
    return {
      kind: 'refused',
      message:
        '目前無法在這裡確認是你本人：需要用原本的 Google 帳號重新驗證，網頁還不支援。',
    };
  }

  return { kind: 'refused', message: detail };
}

const RESUME_KEY = 'resume';
const STEP_UP_KEY = 'step_up';
const STEP_UP_ERROR_KEY = 'step_up_error';
const RETURN_KEYS = [RESUME_KEY, STEP_UP_KEY, STEP_UP_ERROR_KEY];

/**
 * Where to send the page to prove the person at LINE (backend ADR-361). It comes back here marked
 * with the action, and the backend adds how it went (`step_up=ok`, or `step_up_error=<code>`).
 */
export function buildAccountStepUpHref(action: AccountStepUpAction): string {
  const start = new URLSearchParams({
    purpose: 'step_up',
    action,
    app: 'site',
    return_to: `${ACCOUNT_SECURITY_PATH}?${RESUME_KEY}=${action}`,
  });

  return `/api/v1/auth/oauth/line/start?${start}`;
}

/** Back from LINE: for which action, and whether the proof was made or what went wrong there. */
export interface AccountStepUpReturn {
  action: AccountStepUpAction;
  stepUp: 'ok' | { error: string } | null;
}

export function readAccountStepUpReturn(
  query: ReturnQuery,
): AccountStepUpReturn | null {
  const action = ACTIONS.find((known) => known === query.get(RESUME_KEY));

  if (!action) {
    return null;
  }

  const error = query.get(STEP_UP_ERROR_KEY);

  if (error) {
    return { action, stepUp: { error } };
  }

  return { action, stepUp: query.get(STEP_UP_KEY) === 'ok' ? 'ok' : null };
}

/** The address without the way back, so a reload does not repeat it. */
export function stripAccountStepUpReturn(href: string): string {
  return stripQueryKeys(href, RETURN_KEYS);
}

/** Back from LINE with no proof (backend ADR-361 point 6), as `phone-verify-error.ts` says it. */
const LINE_RETURN_ERRORS: Record<string, string> = {
  oauth_cancelled: '已取消 LINE 驗證。',
  step_up_invalid: '請用這個帳號原本的 LINE 帳號登入，並在 5 分鐘內完成。',
  oauth_exchange_failed: '暫時無法向 LINE 確認。',
};

const PRESS_AGAIN: Record<AccountStepUpAction, string> = {
  add_contact: '要新增聯絡方式，請再按一次「發送驗證碼」。',
  set_password: '要建立密碼，請再按一次「建立密碼」。',
};

export function lineReturnError(
  code: string,
  action: AccountStepUpAction,
): string {
  return `${LINE_RETURN_ERRORS[code] ?? 'LINE 驗證沒有完成。'}${PRESS_AGAIN[action]}`;
}

/**
 * Back from LINE with the proof, for a first password: the password itself never left the page, so it
 * is typed again, within the proof's 5 minutes (`PROOF_TTL_SECONDS`).
 */
export const LINE_OK_SET_PASSWORD =
  '已用 LINE 確認是你本人。請在 5 分鐘內再輸入一次新密碼，按「建立密碼」。';

/** Where in adding a contact a refusal came: a wrong password and a wrong code share one code. */
export type AddContactStep =
  | 'send'
  | 'password'
  | 'old-code'
  | 'code'
  | 'resend';

const ADD_CONTACT_STEP_UP_INVALID: Partial<Record<AddContactStep, string>> = {
  password: '密碼不正確，請重新輸入',
  'old-code': '驗證碼不正確或已過期，請重新輸入',
};

export function addContactErrorMessage(
  cause: unknown,
  step: AddContactStep,
): string {
  return resolveAuthErrorMessage(
    cause,
    step === 'code'
      ? '驗證失敗，請稍後再試。'
      : '新增聯絡方式失敗，請稍後再試。',
    {
      identifier_taken: '這個 Email 或手機號碼已經是別的帳號在用，請換一個',
      code_invalid: '驗證碼不正確或已過期，請重新輸入或重新傳送',
      no_pending_contact: '驗證碼已過期，請重新傳送',
      no_proof_channel: '你的帳號沒有可以收驗證碼的聯絡方式，請稍後再試。',
      step_up_invalid:
        ADD_CONTACT_STEP_UP_INVALID[step] ??
        '確認身分沒有成功，請重新傳送驗證碼',
    },
  );
}

export function setPasswordErrorMessage(
  cause: unknown,
  step: 'send' | 'old-code',
): string {
  return resolveAuthErrorMessage(cause, '建立密碼失敗，請稍後再試。', {
    no_proof_channel:
      '你的帳號還沒有可以收驗證碼的 Email 或手機。請先在下面新增一個，再建立密碼。',
    step_up_invalid:
      step === 'old-code'
        ? '驗證碼不正確或已過期，請重新輸入'
        : '確認身分沒有成功，請再按一次「建立密碼」',
  });
}
