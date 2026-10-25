/**
 * The way back for a guest who pressed 「登入後接」: to sign in, then to the page they were on with
 * the ticket open and the need they pressed it on offered to claim (`claim=`).
 */

import {
  buildSignInHref,
  stripQueryKeys,
  type ReturnLocation,
  type ReturnQuery,
} from '../../route/return-query';

/** The need a guest signed in to claim, and its ticket. */
export interface ClaimReturn {
  ticketUuid: string;
  needUuid: string;
}

export function readClaimReturn(query: ReturnQuery): ClaimReturn | null {
  const ticketUuid = query.get('id');
  const needUuid = query.get('claim');

  return ticketUuid && needUuid ? { ticketUuid, needUuid } : null;
}

/** The address without `claim=`, so a reload or a copied link offers nothing. */
export function stripClaimReturn(href: string): string {
  return stripQueryKeys(href, ['claim']);
}

export function buildClaimSignInHref(
  location: ReturnLocation,
  ticketUuid: string,
  needUuid: string,
): string {
  // `id` is the site's open ticket (`route/parse.ts`), and it names the one whose button was
  // pressed, whatever the drawer showed.
  return buildSignInHref(location, { id: ticketUuid, claim: needUuid });
}
