/**
 * What a requester reads when 請求協助 is not filed. The backend's own refusals are English and
 * about fields the form already keeps right, so only a sign-in that ran out and a dropped
 * connection — the two a requester can do something about — get words of their own, as
 * `ticket/needs/claim-error.ts` and `role-request/error.ts` give them.
 */

/** The parts of urql's `CombinedError` this reads. */
export interface SubmitError {
  networkError?: unknown;
  graphQLErrors?: ReadonlyArray<{ message: string }>;
}

export function submitErrorMessage(error: SubmitError | undefined): string {
  if (error?.networkError) {
    return '連線失敗，請確認網路後再試一次。';
  }

  const message = error?.graphQLErrors?.[0]?.message ?? '';
  // An `HTTPException` reads "<status>: <detail>" (Starlette's `__str__`); the status is the part
  // to trust. A session the proxy could not refresh is sent on as a guest, whom
  // `require_authenticated` refuses with a 401.
  const status = /^(\d{3}):/.exec(message)?.[1];

  return status === '401'
    ? '登入已過期，請重新登入後再試一次。'
    : '送出失敗，請稍後再試一次。';
}
