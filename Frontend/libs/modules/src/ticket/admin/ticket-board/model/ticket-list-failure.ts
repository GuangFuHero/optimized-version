import type { ClaimError } from '../../../needs/claim-error';

/**
 * The backend's refusal when reading the tickets outside a box runs past its time limit (backend
 * `tickets(outsideBounds:)` with no keyword, `app/graphql/tickets/queries.py`), which it sends
 * with the limit after it: （上限 3 秒）. It sends no error code, so a message that starts with
 * this sentence is how the list tells the time limit from any other failure.
 */
const OUTSIDE_TIME_LIMIT_REFUSAL =
  '範圍外的單太多，查詢逾時已中止，請縮小篩選再試';

/** What the list says when its page did not load. */
export interface TicketListFailure {
  text: string;
  /** False past the time limit: trying again would meet it again; a narrower filter gets under it. */
  retry: boolean;
}

/** `error` is what the list's read threw: urql's `CombinedError`, or anything else as a plain failure. */
export function ticketListFailure(error: unknown): TicketListFailure {
  const { graphQLErrors } = (error ?? {}) as ClaimError;
  const tooMany = (graphQLErrors ?? []).some(({ message }) =>
    message.trim().startsWith(OUTSIDE_TIME_LIMIT_REFUSAL),
  );

  return tooMany
    ? { text: '範圍外的單太多，請縮小篩選再試', retry: false }
    : { text: '無法載入任務單，請稍後再試', retry: true };
}
