import type { AuthIdentityType } from '@rescue-frontend/data-access';
import { PhoneNumberFormat, PhoneNumberUtil } from 'google-libphonenumber';

export type { AuthIdentityType };

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
    return validateEmailAddress(trimmedValue) ? true : '請輸入有效的電子郵件';
  }

  return validatePhoneNumber(trimmedValue) ? true : '請輸入有效的手機號碼';
}
