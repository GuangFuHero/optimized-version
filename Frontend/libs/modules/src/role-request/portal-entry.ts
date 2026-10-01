/**
 * Which of the two back-office entries the site shows (prototype `SitePortalSwitch`,
 * `Design/前台/js/site/site-shell.jsx:163-172`): 前往後台 for anyone holding a back-office identity,
 * 申請成為後台人員 for everyone else signed in, and neither for a guest.
 *
 * It reads the identities live (`myRoleRequests.hasBackofficeIdentity`) rather than from the session,
 * because approval adds one while the session lives on (Backend Spec/019, ADR-288).
 */
export type SitePortalEntry = 'none' | 'backOffice' | 'apply';

export interface SitePortalState {
  hasBackofficeIdentity: boolean;
}

/** The entry to show, or `none` while signed out or before the identities are known. */
export function sitePortalEntry(
  isAuthenticated: boolean,
  state: SitePortalState | null | undefined,
): SitePortalEntry {
  if (!isAuthenticated || !state) {
    return 'none';
  }

  return state.hasBackofficeIdentity ? 'backOffice' : 'apply';
}

/** Where 前往後台 leads: the back office, which shows a placeholder until it is rebuilt. */
export const BACK_OFFICE_HREF = '/admin';
