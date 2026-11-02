import { describe, expect, it } from 'vitest';

import {
  addNeedErrorMessage,
  assignErrorMessage,
  claimErrorMessage,
  deleteNeedErrorMessage,
  deleteTicketErrorMessage,
  isAssignmentAlreadyGone,
  isNeedAlreadyGone,
  isTicketAlreadyGone,
  progressNoteErrorMessage,
  releaseErrorMessage,
  stopRecruitingErrorMessage,
  unassignErrorMessage,
} from './claim-error';

/** A refused `assignTaskActor`, as urql hands it over: the backend's message is the contract. */
function refused(message: string) {
  return { graphQLErrors: [{ message }] };
}

describe('claimErrorMessage', () => {
  it('says the need filled up while the volunteer was deciding', () => {
    expect(claimErrorMessage(refused('Task is full'))).toBe(
      '這筆需求剛好額滿了。',
    );
  });

  it('says the need is over — called off, done, or its whole request closed', () => {
    expect(claimErrorMessage(refused('Task is no longer open'))).toBe(
      '這筆需求已經結束了。',
    );
  });

  it('says the volunteer already has this need — e.g. claimed from another tab', () => {
    expect(
      claimErrorMessage(refused('Actor already assigned to this task')),
    ).toBe('你已經接過這筆了。');
  });

  it('says the need is gone when it, or its ticket, was deleted', () => {
    expect(claimErrorMessage(refused('Ticket task not found'))).toBe(
      '找不到這筆需求，可能已經被刪除。',
    );
  });

  it('tells a lapsed session from a missing permission, by the status an HTTPException carries', () => {
    expect(
      claimErrorMessage(refused('401: Could not validate credentials')),
    ).toBe('登入已過期，請重新登入後再試一次。');
    expect(claimErrorMessage(refused('403: Permission Denied.'))).toBe(
      '你的帳號沒有承接需求的權限。',
    );
  });

  it('blames the connection when the request never got an answer', () => {
    expect(
      claimErrorMessage({ networkError: new TypeError('Failed to fetch') }),
    ).toBe('連線失敗，請確認網路後再試一次。');
  });

  it('reads an HTTP 401, which urql hands over as a network error, as a lapsed session', () => {
    expect(
      claimErrorMessage({
        networkError: new Error('Unauthorized'),
        response: { status: 401 },
      }),
    ).toBe('登入已過期，請重新登入後再試一次。');
  });

  it('falls back to a plain failure for anything it does not know, masked faults included', () => {
    expect(claimErrorMessage(refused('Unexpected error.'))).toBe(
      '承接失敗，請稍後再試一次。',
    );
  });
});

describe('releaseErrorMessage', () => {
  it('says the list is final once the requester stopped recruiting', () => {
    expect(
      releaseErrorMessage(refused('Recruiting has stopped for this task')),
    ).toBe('建單者已停止招募，名單已固定，無法釋出。');
  });

  it('says the place was given back already — e.g. from another tab', () => {
    expect(releaseErrorMessage(refused('Task assignment not found'))).toBe(
      '這個名額已經釋出了。',
    );
  });

  it('tells a lapsed session from a missing permission, as a claim does', () => {
    expect(
      releaseErrorMessage(refused('401: Could not validate credentials')),
    ).toBe('登入已過期，請重新登入後再試一次。');
    expect(releaseErrorMessage(refused('403: Permission Denied.'))).toBe(
      '你的帳號沒有釋出名額的權限。',
    );
  });

  it('blames the connection, or falls back to a plain failure', () => {
    expect(
      releaseErrorMessage({ networkError: new TypeError('Failed to fetch') }),
    ).toBe('連線失敗，請確認網路後再試一次。');
    expect(releaseErrorMessage(refused('Unexpected error.'))).toBe(
      '釋出失敗，請稍後再試一次。',
    );
  });
});

describe('stopRecruitingErrorMessage', () => {
  it('says the need has its people already — filled meanwhile, or stopped from another tab', () => {
    expect(stopRecruitingErrorMessage(refused('Task is no longer open'))).toBe(
      '這筆需求已經湊齊或停止招募了。',
    );
  });

  it('says nobody is on the need any more — the last of them gave the place back meanwhile', () => {
    expect(
      stopRecruitingErrorMessage(refused('Nobody has claimed this task')),
    ).toBe('目前沒有人承接這筆需求，無法停止招募。');
  });

  it('says the need is gone when it, or its ticket, was deleted', () => {
    expect(stopRecruitingErrorMessage(refused('Ticket task not found'))).toBe(
      '找不到這筆需求，可能已經被刪除。',
    );
  });

  it('tells a lapsed session from a missing permission, as a claim does', () => {
    expect(
      stopRecruitingErrorMessage(
        refused('401: Could not validate credentials'),
      ),
    ).toBe('登入已過期，請重新登入後再試一次。');
    expect(stopRecruitingErrorMessage(refused('403: Permission Denied.'))).toBe(
      '你的帳號沒有停止招募的權限。',
    );
  });

  it('blames the connection, or falls back to a plain failure', () => {
    expect(
      stopRecruitingErrorMessage({
        networkError: new TypeError('Failed to fetch'),
      }),
    ).toBe('連線失敗，請確認網路後再試一次。');
    expect(stopRecruitingErrorMessage(refused('Unexpected error.'))).toBe(
      '停止招募失敗，請稍後再試一次。',
    );
  });
});

describe('addNeedErrorMessage', () => {
  it('says the request is gone when it was deleted while the requester was adding to it', () => {
    expect(addNeedErrorMessage(refused('Ticket not found'))).toBe(
      '這張單已經刪除了。',
    );
  });

  it('asks for the quantity the panel let through, but for a rescue', () => {
    expect(
      addNeedErrorMessage(refused('quantity is required for a supply task')),
    ).toBe('每項需求都要填數量（人員受困除外）。');
  });

  it('says a request closed by hand takes nothing more', () => {
    expect(addNeedErrorMessage(refused('Ticket is no longer open'))).toBe(
      '這張單已經關閉，不能再加。',
    );
  });

  it('says only its requester may add to it, and tells a lapsed session apart', () => {
    expect(addNeedErrorMessage(refused('403: Permission Denied.'))).toBe(
      '只有建這張單的人可以加。',
    );
    expect(
      addNeedErrorMessage(refused('401: Could not validate credentials')),
    ).toBe('登入已過期，請重新登入後再試一次。');
  });

  it('blames the connection, or falls back to a plain failure', () => {
    expect(
      addNeedErrorMessage({ networkError: new TypeError('Failed to fetch') }),
    ).toBe('連線失敗，請確認網路後再試一次。');
    expect(addNeedErrorMessage(refused('Unexpected error.'))).toBe(
      '加不上去，請稍後再試一次。',
    );
  });
});

describe('isNeedAlreadyGone', () => {
  it('reads a refusal for a need deleted already — from another tab, or with its ticket — as done', () => {
    expect(isNeedAlreadyGone(refused('Ticket task not found'))).toBe(true);
  });

  it('does not read any other refusal, or a lost connection, as done', () => {
    expect(isNeedAlreadyGone(refused('403: Permission Denied.'))).toBe(false);
    expect(isNeedAlreadyGone(refused('Unexpected error.'))).toBe(false);
    expect(
      isNeedAlreadyGone({ networkError: new TypeError('Failed to fetch') }),
    ).toBe(false);
  });
});

describe('deleteNeedErrorMessage', () => {
  it('says only its requester may delete it, and tells a lapsed session apart', () => {
    expect(deleteNeedErrorMessage(refused('403: Permission Denied.'))).toBe(
      '只有建這張單的人可以刪除。',
    );
    expect(
      deleteNeedErrorMessage(refused('401: Could not validate credentials')),
    ).toBe('登入已過期，請重新登入後再試一次。');
  });

  it('blames the connection, or falls back to a plain failure', () => {
    expect(
      deleteNeedErrorMessage({
        networkError: new TypeError('Failed to fetch'),
      }),
    ).toBe('連線失敗，請確認網路後再試一次。');
    expect(deleteNeedErrorMessage(refused('Unexpected error.'))).toBe(
      '刪除失敗，請稍後再試一次。',
    );
  });
});

describe('isTicketAlreadyGone', () => {
  it('reads a refusal for a ticket deleted already — from another tab — as done', () => {
    expect(isTicketAlreadyGone(refused('Ticket not found'))).toBe(true);
  });

  it('does not read any other refusal, or a lost connection, as done', () => {
    expect(isTicketAlreadyGone(refused('403: Permission Denied.'))).toBe(false);
    expect(isTicketAlreadyGone(refused('Unexpected error.'))).toBe(false);
    expect(
      isTicketAlreadyGone({ networkError: new TypeError('Failed to fetch') }),
    ).toBe(false);
  });
});

describe('deleteTicketErrorMessage', () => {
  it('says only its requester may delete it, and tells a lapsed session apart', () => {
    expect(deleteTicketErrorMessage(refused('403: Permission Denied.'))).toBe(
      '只有建這張單的人可以刪除。',
    );
    expect(
      deleteTicketErrorMessage(refused('401: Could not validate credentials')),
    ).toBe('登入已過期，請重新登入後再試一次。');
  });

  it('blames the connection, or falls back to a plain failure', () => {
    expect(
      deleteTicketErrorMessage({
        networkError: new TypeError('Failed to fetch'),
      }),
    ).toBe('連線失敗，請確認網路後再試一次。');
    expect(deleteTicketErrorMessage(refused('Unexpected error.'))).toBe(
      '刪除失敗，請稍後再試一次。',
    );
  });
});

describe('assignErrorMessage', () => {
  it('says a need filled meanwhile takes nobody more, even from a coordinator', () => {
    expect(assignErrorMessage(refused('Task is full'))).toBe(
      '這筆需求已經額滿，無法再指派。',
    );
  });

  it('says the member is on the need already', () => {
    expect(
      assignErrorMessage(refused('Actor already assigned to this task')),
    ).toBe('這位成員已經在這筆需求上了。');
  });

  it('says a 403 is the account, not the need', () => {
    expect(assignErrorMessage(refused('403: Permission denied'))).toBe(
      '你的帳號沒有指派這筆需求的權限。',
    );
  });

  it('falls back on anything else', () => {
    expect(assignErrorMessage(refused('Unexpected error.'))).toBe(
      '指派失敗，請稍後再試一次。',
    );
  });
});

describe('unassignErrorMessage and isAssignmentAlreadyGone', () => {
  it('says a stopped need keeps its people', () => {
    expect(
      unassignErrorMessage(refused('Recruiting has stopped for this task')),
    ).toBe('這筆需求已停止招募，承接名單已固定，無法移除。');
  });

  it('says a 403 is the account', () => {
    expect(unassignErrorMessage(refused('403: Permission denied'))).toBe(
      '你的帳號沒有移除這位承接者的權限。',
    );
  });

  it('takes a place gone already for done', () => {
    expect(isAssignmentAlreadyGone(refused('Task assignment not found'))).toBe(
      true,
    );
    expect(isAssignmentAlreadyGone(refused('Task is full'))).toBe(false);
  });
});

describe('progressNoteErrorMessage', () => {
  it('says the need is gone, or that the account may not edit it', () => {
    expect(progressNoteErrorMessage(refused('Ticket task not found'))).toBe(
      '找不到這筆需求，可能已經被刪除。',
    );
    expect(progressNoteErrorMessage(refused('403: Permission Denied.'))).toBe(
      '你的帳號沒有編輯這張單的權限。',
    );
  });

  it('falls back to a plain failure', () => {
    expect(progressNoteErrorMessage(refused('Unexpected error.'))).toBe(
      '進度備註沒有存到，請稍後再試一次。',
    );
  });
});
