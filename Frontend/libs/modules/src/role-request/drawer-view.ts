import type { MyRoleRequestsQuery } from '@rescue-frontend/data-access';

/** One application as `MyRoleRequests` returns it; the list is newest first. */
export type RoleRequestRow =
  MyRoleRequestsQuery['myRoleRequests']['requests'][number];

export type RoleRequestDrawerView =
  | { kind: 'pending'; pending: RoleRequestRow }
  | { kind: 'form'; lastRejected: RoleRequestRow | null; paused: boolean };

/**
 * What the application drawer shows (prototype `RoleElevationDrawer`,
 * `Design/前台/js/site/site-actions.jsx:157-265`):
 * - an application waiting for review, alone — no form, since only one may wait (AC-RE-106);
 * - otherwise the form, under the last application if it was rejected, so its reply is read before
 *   the same thing is sent again (AC-RE-107). A withdrawn one shows no card (Q10);
 * - `paused` when a super admin has switched applying off (`canApply` with nothing waiting).
 */
export function roleRequestDrawerView({
  canApply,
  requests,
}: {
  canApply: boolean;
  requests: readonly RoleRequestRow[];
}): RoleRequestDrawerView {
  const pending = requests.find((request) => request.status === 'pending');

  if (pending) {
    return { kind: 'pending', pending };
  }

  const newest = requests[0];

  return {
    kind: 'form',
    lastRejected: newest?.status === 'rejected' ? newest : null,
    paused: !canApply,
  };
}
