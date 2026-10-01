/**
 * When a signed-in session has ended without the person signing out: revoked elsewhere (另一台裝置
 * 「登出所有裝置」, an admin's sign-out, an identity removed — backend ADR-096) or past its refresh.
 * The GraphQL proxy decides and marks the response; the browser reads the mark
 * (`note/session-expiry-spec.md`).
 *
 * Pure and import-free: the server route and the browser both use it.
 */

/** The response header the proxy marks an ended session with. */
export const SESSION_HEADER = 'x-wg-session';
export const SESSION_EXPIRED = 'expired';

export interface SessionExpiryInput {
  /** The proxy had a session but could not refresh its access token, and sent the request as a guest. */
  refreshFailed: boolean;
  /** The request went to the backend with an access token. */
  sentToken: boolean;
  backendStatus: number;
}

/**
 * A revoked token answers 401 for every request, public ones included (backend
 * `tests/test_graphql/test_session_revocation.py`). A 403 is a signed-in caller who may not do
 * this, and a guest's 401 ends nothing they had.
 */
export function isSessionExpired({
  refreshFailed,
  sentToken,
  backendStatus,
}: SessionExpiryInput): boolean {
  return refreshFailed || (sentToken && backendStatus === 401);
}
