/**
 * 你的基本資料 on an application (prototype G-2, `Design/前台/更新說明.md`, 🔒 2026-10-05): a name,
 * and a mobile phone verified by a code before the application goes. The phone is the account's
 * own once verified, and stays if the application is turned down; the name is kept on the
 * application only and never changes the account's nickname (backend ADR-355). No email: the
 * team settled on the phone alone (2026-10-20).
 */

import type { components } from '@rescue-frontend/data-access/openapi';

type CurrentUser = components['schemas']['UserResponse'];

/** The backend's limit on a name (`users.name`, and the application's `applicant_name`). */
export const APPLICANT_NAME_MAX_LENGTH = 100;

/** What the form needs to know of the signed-in account. */
export interface ApplicantAccount {
  /** The nickname, which the name starts from. */
  nickname: CurrentUser['name'];
  /** In E.164 (`+886912345678`), or null when the account has none verified. */
  verifiedPhone: string | null;
  /** A password account proves it is the person with the password before adding a phone. */
  hasPassword: boolean;
  /** What the password's salt is looked up by: any of the account's contacts. */
  saltIdentifier: string | null;
}

export function readApplicantAccount(user: CurrentUser): ApplicantAccount {
  const contacts = user.contacts ?? [];

  return {
    nickname: user.name,
    verifiedPhone:
      contacts.find((contact) => contact.type === 'phone' && contact.verified)
        ?.value ?? null,
    hasPassword:
      user.login_methods?.some((method) => method.provider === 'password') ??
      false,
    saltIdentifier: contacts[0]?.value ?? null,
  };
}

// Characters as the backend counts them (Python's `len`): an emoji is one, not two UTF-16 units.
const characters = (text: string) => [...text].length;

export function applicantNameProblem(name: string): string | null {
  const trimmed = name.trim();

  if (!trimmed) {
    return '必填';
  }

  return characters(trimmed) > APPLICANT_NAME_MAX_LENGTH
    ? `名字最多 ${APPLICANT_NAME_MAX_LENGTH} 字`
    : null;
}

/** As typed, with the spaces and dashes people put in, and `+886` read as the leading 0. */
export function normalizeMobile(input: string): string {
  const digits = input.replace(/[\s\-()]/g, '');

  return digits.startsWith('+886') ? `0${digits.slice(4)}` : digits;
}

/**
 * A mobile only, though the backend takes any Taiwanese number: the code goes by text message, and
 * a reviewer calls it (prototype `site-actions.jsx:251`).
 */
export function mobileProblem(input: string): string | null {
  const mobile = normalizeMobile(input);

  if (!mobile) {
    return '必填';
  }

  return /^09\d{8}$/.test(mobile) ? null : '手機號碼格式不正確（09 開頭十碼）';
}

/** The same number every time it is sent: the code waits under the number it was sent to. */
export function toE164Mobile(input: string): string {
  return `+886${normalizeMobile(input).slice(1)}`;
}

/** `+886912345678` as people write it, `0912345678`; anything else as stored. */
export function displayPhone(e164: string): string {
  return e164.startsWith('+886') ? `0${e164.slice(4)}` : e164;
}
