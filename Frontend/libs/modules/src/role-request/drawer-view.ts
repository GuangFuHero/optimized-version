import type { MyRoleRequestsQuery } from '@rescue-frontend/data-access';

/** One application as `MyRoleRequests` returns it; the list is newest first. */
export type RoleRequestRow =
  MyRoleRequestsQuery['myRoleRequests']['requests'][number];

export type RoleRequestDrawerView =
  | { kind: 'pending'; pending: RoleRequestRow }
  | { kind: 'granted'; approved: RoleRequestRow | null }
  | { kind: 'form'; lastRejected: RoleRequestRow | null; paused: boolean };

/**
 * What the application drawer shows (prototype `RoleElevationDrawer`,
 * `Design/前台/js/site/site-actions.jsx:157-265`):
 * - an application waiting for review, alone — no form, since only one may wait (AC-RE-106);
 * - `granted` once the caller holds a back-office identity — approved while the drawer was open,
 *   say, which a failed withdrawal's reload reveals. Nothing is left to apply for, and `canApply`
 *   being false then does not mean paused;
 * - otherwise the form, under the last application if it was rejected, so its reply is read before
 *   the same thing is sent again (AC-RE-107). A withdrawn one shows no card: the applicant took it
 *   back themselves, so there is nothing for them to read;
 * - `paused` when a super admin has switched applying off (`canApply` with nothing waiting).
 */
export function roleRequestDrawerView({
  hasBackofficeIdentity,
  canApply,
  requests,
}: {
  hasBackofficeIdentity: boolean;
  canApply: boolean;
  requests: readonly RoleRequestRow[];
}): RoleRequestDrawerView {
  const pending = requests.find((request) => request.status === 'pending');

  // First even for someone who holds an identity: it is still theirs to withdraw.
  if (pending) {
    return { kind: 'pending', pending };
  }

  const newest = requests[0];

  if (hasBackofficeIdentity) {
    return {
      kind: 'granted',
      approved: newest?.status === 'approved' ? newest : null,
    };
  }

  return {
    kind: 'form',
    lastRejected: newest?.status === 'rejected' ? newest : null,
    paused: !canApply,
  };
}
