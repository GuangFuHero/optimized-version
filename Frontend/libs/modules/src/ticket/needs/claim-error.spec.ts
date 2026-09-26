import { describe, expect, it } from 'vitest';

import { claimErrorMessage } from './claim-error';

/** A refused `assignTaskActor`, as urql hands it over: the backend's message is the contract. */
function refused(message: string) {
  return { graphQLErrors: [{ message }] };
}

describe('claimErrorMessage', () => {
  it('says the need filled up while the volunteer was deciding', () => {
    expect(claimErrorMessage(refused('Task is full'))).toBe('這筆需求剛好額滿了。');
  });

  it('says the need is over — called off, done, or its whole request closed', () => {
    expect(claimErrorMessage(refused('Task is no longer open'))).toBe('這筆需求已經結束了。');
  });

  it('says the volunteer already has this need — e.g. claimed from another tab', () => {
    expect(claimErrorMessage(refused('Actor already assigned to this task'))).toBe(
      '你已經接過這筆了。',
    );
  });

  it('says the need is gone when it, or its ticket, was deleted', () => {
    expect(claimErrorMessage(refused('Ticket task not found'))).toBe(
      '找不到這筆需求，可能已經被刪除。',
    );
  });

  it('tells a lapsed session from a missing permission, by the status an HTTPException carries', () => {
    expect(claimErrorMessage(refused('401: Could not validate credentials'))).toBe(
      '登入已過期，請重新登入後再試一次。',
    );
    expect(claimErrorMessage(refused('403: Permission Denied.'))).toBe(
      '你的帳號沒有承接需求的權限。',
    );
  });

  it('blames the connection when the request never got an answer', () => {
    expect(claimErrorMessage({ networkError: new TypeError('Failed to fetch') })).toBe(
      '連線失敗，請確認網路後再試一次。',
    );
  });

  it('falls back to a plain failure for anything it does not know, masked faults included', () => {
    expect(claimErrorMessage(refused('Unexpected error.'))).toBe('承接失敗，請稍後再試一次。');
  });
});
