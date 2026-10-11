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

  it('reads an HTTP 401, which urql hands over as a network error, as a sign-in that ran out', () => {
    expect(
      submitErrorMessage({
        networkError: new Error('Unauthorized'),
        response: { status: 401 },
      }),
    ).toBe('登入已過期，請重新登入後再試一次。');
  });

  it('says what to fix when the form let through a need without a quantity, or too many', () => {
    for (const kind of ['hr', 'supply', 'medical']) {
      expect(
        submitErrorMessage(refusal(`quantity is required for a ${kind} task`)),
      ).toBe('每項需求都要填數量（人員受困除外）。');
    }
    expect(submitErrorMessage(refusal('At most 20 tasks are allowed'))).toBe(
      '一次最多 20 項需求。',
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
