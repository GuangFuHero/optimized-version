import { describe, expect, it } from 'vitest';

import { submitErrorMessage } from './submit-error';

const refusal = (message: string) => ({ graphQLErrors: [{ message }] });

describe('submitErrorMessage', () => {
  it('reads 401 as a sign-in that ran out, so the requester knows to sign in again', () => {
    expect(
      submitErrorMessage(refusal('401: Could not validate credentials')),
    ).toBe('登入已過期，請重新登入後再試一次。');
  });

  it('tells a dropped connection apart from anything else', () => {
    expect(submitErrorMessage({ networkError: new Error('offline') })).toBe(
      '連線失敗，請確認網路後再試一次。',
    );
  });

  it('says only that it failed for every other refusal, whose words are about fields', () => {
    expect(submitErrorMessage(refusal('Unexpected error.'))).toBe(
      '送出失敗，請稍後再試一次。',
    );
    expect(submitErrorMessage(refusal('403: Permission Denied.'))).toBe(
      '送出失敗，請稍後再試一次。',
    );
    expect(submitErrorMessage(refusal('At most 10 photos are allowed'))).toBe(
      '送出失敗，請稍後再試一次。',
    );
  });

  it('says it failed when no ticket came back and nothing said why', () => {
    expect(submitErrorMessage(undefined)).toBe('送出失敗，請稍後再試一次。');
  });
});
