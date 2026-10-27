/**
 * The proof 帳號安全 asks for before a new way into the account: a contact added, or a first password
 * (backend `auth_contact.py`, ADR-215/220/361). The backend decides which proof from the account's
 * shape, and its 422 says so in a sentence; this reads the sentence, builds the way to LINE and back,
 * and words each step and failure as the design has them (`Design/前台/docs/帳號安全與待確認通知.md`:
 * Chinese only, no API words). Ported from 申請管理權限's phone check
 * (`role-request/use-phone-verification.ts`, `apply-return.ts`, `phone-verify-error.ts`).
 */

import { stripQueryKeys, type ReturnQuery } from '../../route/return-query';
import { resolveAuthErrorMessage } from '../api/error-messages';
import type { AuthIdentityType } from '../login';
import type { AccountContact, LoginMethod } from './account-security-view';

export const ACCOUNT_SECURITY_PATH = '/account/security';

/** Something that went wrong: red, or orange for coming back from LINE without the proof (design A1). */
export interface StepUpProblem {
  message: string;
  tone: 'error' | 'warning';
}

/** The two actions here that can need the account's provider (backend `REAUTH_ACTIONS`). */
export type AccountStepUpAction = 'add_contact' | 'set_password';

const ACTIONS: readonly AccountStepUpAction[] = ['add_contact', 'set_password'];

/** What a `step_up_required` asks of the person. */
export type StepUpAsk =
  | { kind: 'password' }
  /** A code at a contact the account had before: just sent, or still `pending` from an earlier try. */
  | { kind: 'old-code'; pending: boolean }
  | { kind: 'refused'; message: string };

/**
 * The backend's sentence, read for what it asks (`_password_proof`, `_old_channel_proof`, `_sso_proof`).
 * - A code sent to a contact the account had before (or already on its way): type it here.
 * - The password.
 * - A provider token, which a browser cannot hold (ADR-331). That is an account with no contact at all and
 *   a provider the site cannot send it back to: Google, which is not one of `REAUTH_PROVIDERS` yet.
 * - Anything else, too many codes sent say, asks for nothing and is passed on.
 */
export function readStepUpRequired(detail: string): StepUpAsk {
  if (detail.endsWith('請填入 step_up.old_channel_code')) {
    return { kind: 'old-code', pending: false };
  }

  if (detail.endsWith('請使用先前收到的那一組')) {
    return { kind: 'old-code', pending: true };
  }

  if (detail.endsWith('需要輸入密碼')) {
    return { kind: 'password' };
  }

  if (detail.includes('step_up.id_token')) {
    return {
      kind: 'refused',
      message:
        '你是用 Google 登入，又還沒有電子郵件或手機，所以暫時不能在這裡做。',
    };
  }

  return { kind: 'refused', message: detail };
}

/**
 * An account the page cannot prove: no password, no contact to send a code to, and no LINE to sign in
 * at again — only Google (`readStepUpRequired`). The page says so before anything is pressed.
 */
export function cannotProveHere(
  contacts: readonly AccountContact[],
  methods: readonly LoginMethod[],
): boolean {
  return (
    contacts.length === 0 &&
    !methods.some(
      (method) => method.provider === 'password' || method.provider === 'line',
    )
  );
}

const CONTACT_NAMES: Record<AuthIdentityType, string> = {
  email: '電子郵件',
  phone: '手機',
};

export function contactName(type: AuthIdentityType): string {
  return CONTACT_NAMES[type];
}

/**
 * Which 「原本的…」 the backend sent its code to: the contact of the kind being added, which it replaces
 * (`_require_step_up`), else the one the account has. With both, `_proof_contact` picks by how long
 * each has been there, which the page leaves to it.
 */
export function originalContactName(
  contacts: readonly AccountContact[],
  adding?: AuthIdentityType,
): string {
  if (adding && contacts.some((contact) => contact.type === adding)) {
    return CONTACT_NAMES[adding];
  }

  const types = new Set(contacts.map((contact) => contact.type));

  if (types.size === 1) {
    const [only] = types;
    return only === 'phone' ? CONTACT_NAMES.phone : CONTACT_NAMES.email;
  }

  return '電子郵件或手機';
}

/** 新增電子郵件或手機's three steps, by the kind being added. */
export function addContactSteps(type: AuthIdentityType): readonly string[] {
  const name = CONTACT_NAMES[type];

  return [`輸入新的${name}`, '確認是你本人', `輸入新的${name}收到的驗證碼`];
}

/**
 * Where the first code went. Without the address for now: the backend's sentence does not name it, and
 * whether it will is with the backend (design A2-4).
 */
export function oldCodeSentText(name: string, pending: boolean): string {
  return pending
    ? `為了確認是你本人，我們之前已經寄了一組驗證碼到你原本的${name}，請輸入那一組。`
    : `為了確認是你本人，我們寄了一組驗證碼到你原本的${name}。`;
}

/**
 * 沒收到？重新寄一次 on the first code: the backend sends another only once the one out has run out
 * (ADR-165, `OTP_TTL_SECONDS`), so the person is told to look again.
 */
export const OLD_CODE_STILL_PENDING =
  '剛剛寄的驗證碼 10 分鐘內都能用，請再找找看。過了 10 分鐘還沒收到，再按一次就會重新寄。';

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

/** The button each action starts again from, and what has not happened yet. */
const AGAIN: Record<AccountStepUpAction, { button: string; notYet: string }> = {
  add_contact: { button: '「寄驗證碼」', notYet: '還沒新增' },
  set_password: { button: '「設定密碼」', notYet: '還沒設定密碼' },
};

/**
 * Back from LINE with no proof (backend ADR-361 point 6): what happened there and which button to press
 * again. `step_up_invalid` is also a sign-in at LINE that was not fresh, which the start asks LINE for.
 */
export function lineReturnError(
  code: string,
  action: AccountStepUpAction,
): string {
  const { button, notYet } = AGAIN[action];

  switch (code) {
    case 'oauth_cancelled':
      return `你在 LINE 那邊按了取消，所以${notYet}。要再試一次，請按${button}。`;
    case 'step_up_invalid':
      return '你剛剛登入的 LINE 不是這個帳號用的那一個，請用原本的 LINE 再試一次。';
    case 'oauth_exchange_failed':
      return `現在連不上 LINE，請等一下再按${button}。`;
    default:
      return `LINE 那邊沒有確認成功，所以${notYet}。要再試一次，請按${button}。`;
  }
}

/** Back from LINE with the proof, but it ran out before it was spent (`PROOF_TTL_SECONDS`). */
export function lineProofExpired(action: AccountStepUpAction): string {
  return `LINE 的確認已經過期（要在 5 分鐘內完成），請再按一次${AGAIN[action].button}。`;
}

/**
 * Back from LINE with the proof, for a first password: the password itself never left the page, so it
 * is typed again, within the proof's 5 minutes (`PROOF_TTL_SECONDS`).
 */
export const LINE_OK_SET_PASSWORD =
  '已用 LINE 確認是你本人。請在 5 分鐘內再輸入一次新密碼，按「設定密碼」。';

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
    step === 'code' ? '驗證失敗，請稍後再試。' : '新增失敗，請稍後再試。',
    {
      identifier_taken: '這個電子郵件或手機已經是別的帳號在用，請換一個',
      code_invalid:
        '驗證碼不正確或已過期，請重新輸入，或按「沒收到？重新寄一次」',
      no_pending_contact: '驗證碼已過期，請按「沒收到？重新寄一次」',
      no_proof_channel: '你的帳號沒有可以收驗證碼的地方，請稍後再試。',
      step_up_invalid:
        ADD_CONTACT_STEP_UP_INVALID[step] ?? '確認是你本人沒有成功，請再試一次',
    },
  );
}

export function setPasswordErrorMessage(
  cause: unknown,
  step: 'send' | 'old-code',
): string {
  return resolveAuthErrorMessage(cause, '設定密碼失敗，請稍後再試。', {
    no_proof_channel:
      '你的帳號還沒有可以收驗證碼的電子郵件或手機。請先在下面新增一個，再設定密碼。',
    step_up_invalid:
      step === 'old-code'
        ? '驗證碼不正確或已過期，請重新輸入'
        : '確認是你本人沒有成功，請再按一次「設定密碼」',
  });
}
