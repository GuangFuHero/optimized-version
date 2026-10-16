/**
 * What a requester reads when 請求協助 is not filed. The backend's own refusals are English and
 * mostly about fields the form already keeps right, so a sign-in that ran out and a dropped
 * connection — the two a requester can do something about — get words of their own, as
 * `ticket/needs/claim-error.ts` and `role-request/error.ts` give them. So do the two the form
 * also checks first, in case one gets through: a need without its count, and too many needs.
 */

import { isUnauthorizedError } from '../../session/expiry';
import { QUANTITY_REFUSALS } from '../needs/claim-error';

/** The parts of urql's `CombinedError` this reads. */
export interface SubmitError {
  networkError?: unknown;
  response?: { status?: number };
  graphQLErrors?: ReadonlyArray<{ message: string }>;
}

/** `create_help_request`'s refusals (backend `services/ticket.py`), word for word. */
const REFUSALS: Record<string, string> = {
  ...QUANTITY_REFUSALS,
  'At most 20 tasks are allowed': '一次最多 20 項需求。',
};

export function submitErrorMessage(error: SubmitError | undefined): string {
  // A sign-in that ran out comes two ways, and the first looks like a dropped connection, so it is
  // asked first: a token the backend cannot validate is turned down by its GraphQL context with an
  // HTTP 401, which urql hands over as a `networkError` beside a `response` of 401; a session the
  // proxy could not refresh is sent on as a guest, whom `require_authenticated` refuses with
  // "401: <detail>" in the GraphQL errors (`isUnauthorizedError`).
  if (error && isUnauthorizedError(error)) {
    return '登入已過期，請重新登入後再試一次。';
  }

  if (error?.networkError) {
    return '連線失敗，請確認網路後再試一次。';
  }

  return (
    REFUSALS[error?.graphQLErrors?.[0]?.message ?? ''] ??
    '送出失敗，請稍後再試一次。'
  );
}
