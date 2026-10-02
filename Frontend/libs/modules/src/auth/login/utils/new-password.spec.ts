import { describe, expect, it } from 'vitest';

import {
  newPasswordFieldProblems,
  newPasswordProblem,
  newPasswordText,
  normalizePassword,
} from './new-password';

describe('normalizePassword', () => {
  it('drops the spaces around a password, as sign-in has always sent it', () => {
    expect(normalizePassword(' abcd1234 ')).toBe('abcd1234');
  });

  it('keeps the spaces inside it', () => {
    expect(normalizePassword('ab cd 1234')).toBe('ab cd 1234');
  });
});

describe('newPasswordProblem', () => {
  it('turns down seven characters', () => {
    expect(newPasswordProblem('abc1234')).toBe(newPasswordText.tooShort);
  });

  it('takes eight', () => {
    expect(newPasswordProblem('abcd1234')).toBeNull();
  });

  it('counts what is left once the spaces around it go', () => {
    expect(newPasswordProblem('  abc1234  ')).toBe(newPasswordText.tooShort);
  });

  it('turns down a second entry that differs', () => {
    expect(newPasswordProblem('abcd1234', 'abcd1235')).toBe(
      newPasswordText.mismatch,
    );
  });

  it('takes a second entry that differs only in the spaces around it: they are the same password', () => {
    expect(newPasswordProblem('abcd1234', ' abcd1234 ')).toBeNull();
  });

  it('says it is too short before it says they differ', () => {
    expect(newPasswordProblem('abc', 'abd')).toBe(newPasswordText.tooShort);
  });

  it('has the words agreed for every place a password is set (spec Q14)', () => {
    expect(newPasswordText).toEqual({
      tooShort: '密碼至少 8 個字元',
      mismatch: '兩次輸入的密碼不一樣',
      placeholder: '至少 8 個字元',
    });
  });
});

describe('newPasswordFieldProblems', () => {
  it('puts a short password under the password field', () => {
    expect(newPasswordFieldProblems('abc1234', 'abc1234')).toEqual({
      password: newPasswordText.tooShort,
    });
  });

  it('puts a second entry that differs under the second field', () => {
    expect(newPasswordFieldProblems('abcd1234', 'abcd1235')).toEqual({
      confirm: newPasswordText.mismatch,
    });
  });

  it('marks nothing when both are right', () => {
    expect(newPasswordFieldProblems('abcd1234', ' abcd1234 ')).toEqual({});
  });
});
