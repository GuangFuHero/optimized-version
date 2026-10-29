/**
 * The proof 帳號安全 asks for before a new way into the account: a contact added, or a first password
 * (backend `auth_contact.py`, ADR-215/220/361). The backend decides which proof from the account's
 * shape, and its 422 says so in a sentence; this reads the sentence, builds the way to LINE and back,
 * and words each step and failure as the design has them (`Design/前台/docs/帳號安全與待確認通知.md`:
 * Chinese only, no API words). Ported from 申請管理權限's phone check
 * (`role-request/use-phone-verification.ts`, `apply-return.ts`, `phone-verify-error.ts`).
 */

import { ApiError } from '@rescue-frontend/data-access';

import { stripQueryKeys, type ReturnQuery } from '../../route/return-query';
import { resolveAuthErrorMessage } from '../api/error-messages';
import type { AuthIdentityType } from '../login';
import { normalizeIdentityValue } from '../login/utils/identity-validation';
import type { AccountContact, LoginMethod } from './account-security-view';

export const ACCOUNT_SECURITY_PATH = '/account/security';

/** Something that went wrong: red, or orange for coming back from LINE without the proof (design A1). */
export interface StepUpProblem {
  message: string;
  tone: 'error' | 'warning';
}

/**
 * The two actions here that can need the account's provider (backend `REAUTH_ACTIONS`). The page goes to
 * LINE only for a contact: a first password needs an email or a phone first (`setPasswordBlocked`), whose
 * code proves the person instead.
 */
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

/**
 * Why 設定登入密碼 is closed, or null when it is open. A password signs in with an email or a phone, so an
 * account with neither could not use one: it adds one first. Google only cannot add one here either
 * (`cannotProveHere`).
 */
export function setPasswordBlocked(
  contacts: readonly AccountContact[],
  methods: readonly LoginMethod[],
): string | null {
  if (contacts.length > 0) {
    return null;
  }

  return cannotProveHere(contacts, methods)
    ? '你是用 Google 登入，又還沒有電子郵件或手機，所以暫時不能設定。'
    : '要先新增電子郵件或手機，才能設密碼。以後用密碼登入時，就打你新增的電子郵件或手機。';
}

const CONTACT_NAMES: Record<AuthIdentityType, string> = {
  email: '電子郵件',
  phone: '手機',
};

export function contactName(type: AuthIdentityType): string {
  return CONTACT_NAMES[type];
}

/**
 * The contact a new one of the same kind takes the place of: an account holds one of each
 * (`uq_contact_user_type`), so the backend replaces it (`start_contact_change`), and with it the address a
 * password signs in with.
 */
export function replacedContact(
  contacts: readonly AccountContact[],
  type: AuthIdentityType,
): AccountContact | null {
  return contacts.find((contact) => contact.type === type) ?? null;
}

/**
 * 更換's warning, over its first button (design A1): the contact that goes, with its address — the
 * person's own, from `/users/me`. 新增 has none.
 */
export function replaceNotice(
  replaced: Pick<AccountContact, 'type' | 'value'>,
  signsInWithPassword: boolean,
): string {
  const name =
    replaced.type === 'phone' ? CONTACT_NAMES.phone : CONTACT_NAMES.email;
  const notice = `換好之後，原本的 ${replaced.value} 就不能再用。`;

  // A password signs in with an email or a phone (`authenticate_password`), whichever the person
  // types; only someone who types this kind has to change.
  return signsInWithPassword
    ? `${notice}如果你是用${name}登入，以後登入要打新的${name}。`
    : notice;
}

/**
 * The account's own email or phone typed again. The backend counts it as in use (`is_value_taken`) and
 * would say so only after the password or the first code, as if another account had it.
 */
export function sameAsCurrentContact(
  current: Pick<AccountContact, 'value'> | null,
  type: AuthIdentityType,
  value: string,
): string | null {
  if (!current) {
    return null;
  }

  try {
    if (normalizeIdentityValue(type, value) !== current.value) {
      return null;
    }
  } catch {
    // Not a phone number at all: the field's own check says so.
    return null;
  }

  return `這就是你現在的${CONTACT_NAMES[type]}，請輸入新的${CONTACT_NAMES[type]}。`;
}

/** The row's line while closed: the account's email and phone, its own, in full. */
export function contactsSummary(contacts: readonly AccountContact[]): string {
  const valueOf = (type: AuthIdentityType) =>
    replacedContact(contacts, type)?.value ?? '還沒有';

  // A full-width space between the two, as the design writes it.
  return `電子郵件：${valueOf('email')}\u3000手機：${valueOf('phone')}`;
}

/** Where the second code went, and, at the moment of finishing, the contact that goes. */
export function newCodeSentText(
  type: AuthIdentityType,
  value: string,
  replaced: Pick<AccountContact, 'value'> | null,
): string {
  const sent = `驗證碼已經寄到你新的${CONTACT_NAMES[type]} ${value}。`;

  return replaced
    ? `${sent}完成後，原本的 ${replaced.value} 就不能再用。`
    : sent;
}

export function contactAddedText(
  type: AuthIdentityType,
  value: string,
  replaced: boolean,
): string {
  return replaced
    ? `已經把${CONTACT_NAMES[type]}換成 ${value}。`
    : `已經新增${CONTACT_NAMES[type]} ${value}。`;
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

/** 更換 or 新增's three steps, by the kind. */
export function addContactSteps(type: AuthIdentityType): readonly string[] {
  const name = CONTACT_NAMES[type];

  return [`輸入新的${name}`, '確認是你本人', `輸入新的${name}收到的驗證碼`];
}

/**
 * Where the first code went, without the address: the backend's sentence does not name it, and naming it
 * is one of the design's backend questions left out of V1 (design A2-4).
 */
export function oldCodeSentText(name: string, pending: boolean): string {
  return pending
    ? `為了確認是你本人，我們之前已經寄了一組驗證碼到你原本的${name}，請輸入那一組。`
    : `為了確認是你本人，我們寄了一組驗證碼到你原本的${name}。`;
}

/**
 * 沒收到？重新寄一次 on the first code: the backend sends another only once the one out has run out
 * (ADR-165, `OTP_TTL_SECONDS`), so the person is told where to look again (design A1). No address:
 * the backend does not give it.
 */
export function oldCodeStillPending(name: string): string {
  const look = `剛剛寄的驗證碼 10 分鐘內都能用，不用重寄。請到你原本的${name}再找一下`;

  return name === CONTACT_NAMES.phone
    ? `${look}。`
    : `${look}，也看看「垃圾郵件」。`;
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

/** Where in adding a contact a refusal came: a wrong password and a wrong code share one code. */
export type AddContactStep =
  | 'send'
  | 'password'
  | 'old-code'
  | 'code'
  | 'resend';

/**
 * A refusal only step 1 gets past: the address is in use, which the backend can say at any step
 * — first at step 2 for a password account, or once someone else has claimed it while the code was out —
 * or no code is left to send again (`no_pending_contact`: it ran out, or was guessed wrong too often),
 * which only 寄驗證碼 starts afresh.
 */
export function startsOverAtFirstStep(cause: unknown): boolean {
  const code = cause instanceof ApiError ? cause.code : undefined;

  return code === 'identifier_taken' || code === 'no_pending_contact';
}

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
      rate_limited: '嘗試太多次，請稍後再試。',
      code_invalid:
        '驗證碼不正確或已過期，請重新輸入，或按「沒收到？重新寄一次」',
      no_pending_contact: '這組驗證碼已經不能用了，請再按一次「寄驗證碼」。',
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
  const addOneFirst =
    '你的帳號還沒有可以收驗證碼的電子郵件或手機。請先在下面新增一個，再設定密碼。';

  // The page closes the section for such an account (`setPasswordBlocked`); these are its last contact
  // being gone since the page was read.
  return resolveAuthErrorMessage(cause, '設定密碼失敗，請稍後再試。', {
    no_proof_channel: addOneFirst,
    step_up_reauth_required: addOneFirst,
    step_up_invalid:
      step === 'old-code'
        ? '驗證碼不正確或已過期，請重新輸入'
        : '確認是你本人沒有成功，請再按一次「設定密碼」',
  });
}
