import { describe, expect, it } from 'vitest';

import { validateIdentityValue } from './identity-validation';

describe('validateIdentityValue', () => {
  it('asks for the account when nothing is typed', () => {
    expect(validateIdentityValue('email', '  ')).toBe('請輸入電子郵件');
    expect(validateIdentityValue('phone', '')).toBe('請輸入手機號碼');
  });

  it('says an email is malformed in the words the design gives', () => {
    expect(validateIdentityValue('email', 'abc')).toBe('電子郵件格式不正確');
  });

  it('says how a phone number should look, since the form no longer shows it beforehand', () => {
    expect(validateIdentityValue('phone', '123')).toBe(
      '手機號碼格式不正確（09 開頭十碼，或 +886 格式）',
    );
  });

  it('takes a well-formed email and a Taiwan mobile number either way it is written', () => {
    expect(validateIdentityValue('email', 'hua@example.com')).toBe(true);
    expect(validateIdentityValue('phone', '0912345678')).toBe(true);
    expect(validateIdentityValue('phone', '+886912345678')).toBe(true);
  });
});
