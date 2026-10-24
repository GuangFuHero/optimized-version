/**
 * What an applicant reads when sending or withdrawing an application is refused. The backend's
 * messages are contract — only a `ValueError` or an `HTTPException` reaches the client unmasked
 * (backend `graphql/schema.py`) — so this maps them word for word, as `ticket/needs/claim-error.ts`
 * does for claims.
 */

import { isUnauthorizedError } from '../session/expiry';

/** The parts of urql's `CombinedError` this reads. */
export interface RoleRequestError {
  networkError?: unknown;
  response?: { status?: number };
  graphQLErrors?: ReadonlyArray<{ message: string }>;
}

// The team picked has gone from the list since it was read (suspended, say), or a team took the
// new name meanwhile: the list is read again.
const TEAM_LIST_REFUSALS = new Set([
  'Team not found',
  'A team with this name already exists',
]);

/** `submit`'s and `withdraw`'s refusals (backend `services/role_request.py`), word for word. */
const REFUSALS: Record<string, string> = {
  'You already have a pending request': '你已經有一筆申請在審核中。',
  // Only a data auditor application asks this since Spec/026 (ADR-351).
  'Only an account without a back-office identity can apply':
    '你已經有管理平台身分，不能申請資料檢核員。',
  'Reason is required': '請填寫申請理由。',
  'Reason must be at most 500 characters': '申請理由最多 500 字。',
  'Name is required': '請填寫你的名字。',
  'Name must be at most 100 characters': '名字最多 100 字。',
  'A verified phone number is required': '請先完成手機驗證。',
  'Pick a team or name a new one': '請選擇你所屬的單位或團隊。',
  'Pick a team or a new name, not both':
    '請選擇清單裡的單位或團隊，或建立新的，擇一即可。',
  // Unknown, not active and of the other type read the same (ADR-352).
  'Team not found': '這個單位或團隊目前不能申請加入，可能已停用，請重新選擇。',
  // A suspended team keeps its name but is not on the list, so the name may have to change.
  'A team with this name already exists':
    '已經有同名的單位或團隊，請直接在清單裡選它，或換一個名稱。',
  'Team name must be at most 100 characters': '團隊名稱最多 100 字。',
  'You are already a member of this team': '你已經是這個團隊的成員了。',
  // Decided by a reviewer, or withdrawn in another tab, before this withdrawal arrived.
  'Role request is no longer pending': '這筆申請已經不在審核中，不能撤回。',
  // Not this account's: another tab signed in as someone else since the list was read.
  'Role request not found': '找不到這筆申請。',
};

/** An `HTTPException` reads "<status>: <detail>"; the status is the part to trust. */
const HTTP_REFUSALS: Record<string, string> = {
  // role_request.add revoked from `user` at /admin/rbac: a super admin paused applications.
  '403': '目前暫停開放申請。',
};

/** Whether the refusal means the team list the form shows is out of date. */
export function isTeamListRefusal(error: RoleRequestError): boolean {
  return TEAM_LIST_REFUSALS.has(error.graphQLErrors?.[0]?.message ?? '');
}

/** `fallback` names what failed when the backend's message is not one this knows. */
export function roleRequestErrorMessage(
  error: RoleRequestError,
  fallback = '送出失敗，請稍後再試一次。',
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
    fallback
  );
}
