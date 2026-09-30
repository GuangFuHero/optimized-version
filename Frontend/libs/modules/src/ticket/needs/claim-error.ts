/**
 * What a volunteer reads when a claim is refused. The backend's messages are contract — only a
 * `ValueError` or an `HTTPException` reaches the client unmasked (backend `graphql/schema.py`).
 */

/** The parts of urql's `CombinedError` this reads. */
export interface ClaimError {
  networkError?: unknown;
  graphQLErrors?: ReadonlyArray<{ message: string }>;
}

/** `assign_task_actor`'s refusals (backend `services/ticket.py`), word for word. */
const REFUSALS: Record<string, string> = {
  'Task is full': '這筆需求剛好額滿了。',
  // A canceled need, or one with room left that is fulfilled or on a completed or cancelled ticket:
  // a full need says 'Task is full' whatever its ticket's status (`_lock_task_with_room`).
  'Task is no longer open': '這筆需求已經結束了。',
  'Actor already assigned to this task': '你已經接過這筆了。',
  // The need was deleted, or its ticket was.
  'Ticket task not found': '找不到這筆需求，可能已經被刪除。',
};

/** An `HTTPException` reads "<status>: <detail>" (Starlette's `__str__`); the status is the part to trust. */
const HTTP_REFUSALS: Record<string, string> = {
  '401': '登入已過期，請重新登入後再試一次。',
  '403': '你的帳號沒有承接需求的權限。',
};

export function claimErrorMessage(error: ClaimError): string {
  if (error.networkError) {
    return '連線失敗，請確認網路後再試一次。';
  }

  const message = error.graphQLErrors?.[0]?.message ?? '';
  const status = /^(\d{3}):/.exec(message)?.[1];

  // Anything else — a masked server fault reads "Unexpected error." — gets no detail to act on.
  return (
    REFUSALS[message] ??
    (status ? HTTP_REFUSALS[status] : undefined) ??
    '承接失敗，請稍後再試一次。'
  );
}
