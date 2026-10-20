/**
 * What someone reads when a suggestion is refused. The backend's messages are contract — only a
 * `ValueError` or an `HTTPException` reaches the client unmasked (backend `graphql/schema.py`) — so
 * this maps them word for word, as `role-request/error.ts` does.
 */

import { isUnauthorizedError } from '../../session/expiry';

/** The parts of urql's `CombinedError` this reads. */
export interface StationSuggestionError {
  networkError?: unknown;
  response?: { status?: number };
  graphQLErrors?: ReadonlyArray<{ message: string }>;
}

/** `create_station_suggestion`'s refusals (backend `services/suggestion.py`), word for word. */
const REFUSALS: Record<string, string> = {
  // Taken down, or merged into another, since the map was read.
  'station not found': '這個站點已經不在地圖上，無法送出修改建議。',
  "'new_value' must be at most 1000 characters": '建議內容最多 1000 字。',
  "'comment' must be at most 1000 characters": '補充說明最多 1000 字。',
};

/** An `HTTPException` reads "<status>: <detail>"; the status is the part to trust. */
const HTTP_REFUSALS: Record<string, string> = {
  // No station.contribute: a data auditor's identity, or the capability taken from `user`.
  '403': '你目前的身分不能送出修改建議。',
};

export function stationSuggestionErrorMessage(
  error: StationSuggestionError,
): string {
  // Before the connection: an HTTP 401 comes as a `networkError` too (`isUnauthorizedError`).
  if (isUnauthorizedError(error)) {
    return '登入已過期，請重新登入後再試一次。';
  }

  if (error.networkError) {
    return '連線失敗，請確認網路後再試一次。';
  }

  const message = error.graphQLErrors?.[0]?.message ?? '';
  const status = /^(\d{3}):/.exec(message)?.[1];

  return (
    REFUSALS[message] ??
    (status ? HTTP_REFUSALS[status] : undefined) ??
    '送出失敗，請稍後再試一次。'
  );
}
