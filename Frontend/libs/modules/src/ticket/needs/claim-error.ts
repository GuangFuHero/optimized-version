/**
 * What a volunteer reads when a claim, or giving a place back, is refused — and a requester, when
 * stopping recruitment is. The backend's messages are contract — only a `ValueError` or an
 * `HTTPException` reaches the client unmasked (backend `graphql/schema.py`).
 */

/** The parts of urql's `CombinedError` this reads. */
export interface ClaimError {
  networkError?: unknown;
  graphQLErrors?: ReadonlyArray<{ message: string }>;
}

/** What one action says for each way it can be refused. */
interface RefusalWords {
  /** The backend's refusals for it (`services/ticket.py`), word for word. */
  refusals: Record<string, string>;
  /** A 403: the account may not do this at all. */
  forbidden: string;
  /** Anything else — a masked server fault reads "Unexpected error." — with no detail to act on. */
  fallback: string;
}

function refusalMessage(error: ClaimError, words: RefusalWords): string {
  if (error.networkError) {
    return '連線失敗，請確認網路後再試一次。';
  }

  const message = error.graphQLErrors?.[0]?.message ?? '';
  // An `HTTPException` reads "<status>: <detail>" (Starlette's `__str__`); the status is the part
  // to trust.
  const status = /^(\d{3}):/.exec(message)?.[1];

  if (words.refusals[message]) {
    return words.refusals[message];
  }

  if (status === '401') {
    return '登入已過期，請重新登入後再試一次。';
  }

  return status === '403' ? words.forbidden : words.fallback;
}

/** `assign_task_actor`'s refusals. */
const CLAIM_WORDS: RefusalWords = {
  refusals: {
    'Task is full': '這筆需求剛好額滿了。',
    // A canceled need, or one with room left that is fulfilled or on a completed or cancelled
    // ticket: a full need says 'Task is full' whatever its ticket's status (`_lock_task_with_room`).
    'Task is no longer open': '這筆需求已經結束了。',
    'Actor already assigned to this task': '你已經接過這筆了。',
    // The need was deleted, or its ticket was.
    'Ticket task not found': '找不到這筆需求，可能已經被刪除。',
  },
  forbidden: '你的帳號沒有承接需求的權限。',
  fallback: '承接失敗，請稍後再試一次。',
};

/** `unassign_task_actor`'s refusals. */
const RELEASE_WORDS: RefusalWords = {
  refusals: {
    // The requester stopped recruiting since the list was read: its people are fixed (Q46).
    'Recruiting has stopped for this task':
      '建單者已停止招募，名單已固定，無法釋出。',
    // Given back already — from another tab, or by a coordinator.
    'Task assignment not found': '這個名額已經釋出了。',
  },
  forbidden: '你的帳號沒有釋出名額的權限。',
  fallback: '釋出失敗，請稍後再試一次。',
};

/** `stop_recruiting`'s refusals. */
const STOP_RECRUITING_WORDS: RefusalWords = {
  refusals: {
    // Filled by a claim since the row was read, or stopped already from another tab.
    'Task is no longer open': '這筆需求已經湊齊或停止招募了。',
    // The last person on it gave the place back meanwhile: with no one to keep, it can only be
    // deleted (Q39).
    'Nobody has claimed this task': '目前沒有人承接這筆需求，無法停止招募。',
    // The need was deleted, or its ticket was.
    'Ticket task not found': '找不到這筆需求，可能已經被刪除。',
  },
  forbidden: '你的帳號沒有停止招募的權限。',
  fallback: '停止招募失敗，請稍後再試一次。',
};

export function claimErrorMessage(error: ClaimError): string {
  return refusalMessage(error, CLAIM_WORDS);
}

export function releaseErrorMessage(error: ClaimError): string {
  return refusalMessage(error, RELEASE_WORDS);
}

export function stopRecruitingErrorMessage(error: ClaimError): string {
  return refusalMessage(error, STOP_RECRUITING_WORDS);
}
