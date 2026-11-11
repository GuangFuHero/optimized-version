import type { components } from '@rescue-frontend/data-access/openapi';
import { PhoneNumberFormat, PhoneNumberUtil } from 'google-libphonenumber';

export type AuthIdentityType =
  components['schemas']['AddContactRequest']['type'];

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneNumberUtil = PhoneNumberUtil.getInstance();
const DEFAULT_PHONE_REGION = 'TW';

export function validateEmailAddress(value: string) {
  return emailPattern.test(value.trim());
}

export function validatePhoneNumber(value: string) {
  try {
    const parsedPhoneNumber = phoneNumberUtil.parse(
      value.trim(),
      DEFAULT_PHONE_REGION,
    );

    return phoneNumberUtil.isValidNumber(parsedPhoneNumber);
  } catch {
    return false;
  }
}

export function normalizePhoneNumber(value: string) {
  const parsedPhoneNumber = phoneNumberUtil.parse(
    value.trim(),
    DEFAULT_PHONE_REGION,
  );

  if (!phoneNumberUtil.isValidNumber(parsedPhoneNumber)) {
    throw new Error('invalid-phone-number');
  }

  return phoneNumberUtil.format(parsedPhoneNumber, PhoneNumberFormat.E164);
}

export function normalizeIdentityValue(
  identityType: AuthIdentityType,
  value: string,
) {
  const trimmedValue = value.trim();

  if (identityType === 'email') {
    return trimmedValue.toLowerCase();
  }

  return normalizePhoneNumber(trimmedValue);
}

export function validateIdentityValue(
  identityType: AuthIdentityType,
  value: string,
) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return identityType === 'email' ? '請輸入電子郵件' : '請輸入手機號碼';
  }

  if (identityType === 'email') {
    return validateEmailAddress(trimmedValue) ? true : '電子郵件格式不正確';
  }

  // The form no longer shows the accepted shapes beforehand (design `site-auth.jsx`), so this says them.
  return validatePhoneNumber(trimmedValue)
    ? true
    : '手機號碼格式不正確（09 開頭十碼，或 +886 格式）';
}

/**
 * A stored E.164 number the way people here write it: +886912345678 → 0912 345 678. A number from
 * elsewhere keeps its country code, without which it could not be dialled from Taiwan.
 */
export function formatPhoneForDisplay(value: string) {
  try {
    const parsed = phoneNumberUtil.parse(value.trim(), DEFAULT_PHONE_REGION);

    if (!phoneNumberUtil.isValidNumber(parsed)) {
      return value;
    }

    return phoneNumberUtil.format(
      parsed,
      phoneNumberUtil.getRegionCodeForNumber(parsed) === DEFAULT_PHONE_REGION
        ? PhoneNumberFormat.NATIONAL
        : PhoneNumberFormat.INTERNATIONAL,
    );
  } catch {
    return value;
  }
}
