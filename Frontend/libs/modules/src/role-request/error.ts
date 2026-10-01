/**
 * What an applicant reads when an application is refused. The backend's messages are contract — only
 * a `ValueError` or an `HTTPException` reaches the client unmasked (backend `graphql/schema.py`) —
 * so this maps them word for word, as `ticket/needs/claim-error.ts` does for claims.
 */

/** The parts of urql's `CombinedError` this reads. */
export interface RoleRequestError {
  networkError?: unknown;
  graphQLErrors?: ReadonlyArray<{ message: string }>;
}

/** `role_request.submit`'s refusals (backend `services/role_request.py`), word for word. */
const REFUSALS: Record<string, string> = {
  'You already have a pending request': '你已經有一筆申請在審核中。',
  'Only an account without a back-office identity can apply':
    '你已經有後台身分，不需要申請。',
  'Reason is required': '請填寫申請理由。',
  'Reason must be at most 500 characters': '申請理由最多 500 字。',
  'Contact must be at most 100 characters': '聯絡方式最多 100 字。',
};

/** An `HTTPException` reads "<status>: <detail>"; the status is the part to trust. */
const HTTP_REFUSALS: Record<string, string> = {
  '401': '登入已過期，請重新登入後再試一次。',
  // role_request.add revoked from `user` at /admin/rbac: a super admin paused applications.
  '403': '目前暫停開放申請。',
};

export function roleRequestErrorMessage(error: RoleRequestError): string {
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
