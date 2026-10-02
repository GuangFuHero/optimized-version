import { describe, expect, it } from 'vitest';

import { roleRequestErrorMessage } from './error';

const refusal = (message: string) => ({ graphQLErrors: [{ message }] });

describe('roleRequestErrorMessage', () => {
  it("puts the backend's refusals in the site's words", () => {
    expect(
      roleRequestErrorMessage(refusal('You already have a pending request')),
    ).toBe('你已經有一筆申請在審核中。');
    expect(
      roleRequestErrorMessage(
        refusal('Only an account without a back-office identity can apply'),
      ),
    ).toBe('你已經有後台身分，不需要申請。');
    expect(roleRequestErrorMessage(refusal('Reason is required'))).toBe(
      '請填寫申請理由。',
    );
    expect(
      roleRequestErrorMessage(refusal('Reason must be at most 500 characters')),
    ).toBe('申請理由最多 500 字。');
    expect(
      roleRequestErrorMessage(
        refusal('Contact must be at most 100 characters'),
      ),
    ).toBe('聯絡方式最多 100 字。');
  });

  it('reads 403 as applications being paused, and 401 as a sign-in that ran out', () => {
    expect(roleRequestErrorMessage(refusal('403: Permission Denied.'))).toBe(
      '目前暫停開放申請。',
    );
    expect(
      roleRequestErrorMessage(refusal('401: Could not validate credentials')),
    ).toBe('登入已過期，請重新登入後再試一次。');
  });

  it('tells a dropped connection apart from anything else', () => {
    expect(
      roleRequestErrorMessage({ networkError: new Error('offline') }),
    ).toBe('連線失敗，請確認網路後再試一次。');
    expect(roleRequestErrorMessage(refusal('Unexpected error.'))).toBe(
      '送出失敗，請稍後再試一次。',
    );
  });

  it('reads an HTTP 401, which urql hands over as a network error, as a sign-in that ran out', () => {
    expect(
      roleRequestErrorMessage({
        networkError: new Error('Unauthorized'),
        response: { status: 401 },
      }),
    ).toBe('登入已過期，請重新登入後再試一次。');
  });

  it("puts a withdrawal's refusals in the site's words", () => {
    expect(
      roleRequestErrorMessage(refusal('Role request is no longer pending')),
    ).toBe('這筆申請已經不在審核中，不能撤回。');
    expect(roleRequestErrorMessage(refusal('Role request not found'))).toBe(
      '找不到這筆申請。',
    );
  });

  it('falls back to what the caller was doing', () => {
    expect(
      roleRequestErrorMessage(
        refusal('Unexpected error.'),
        '撤回失敗，請稍後再試一次。',
      ),
    ).toBe('撤回失敗，請稍後再試一次。');
  });
});
