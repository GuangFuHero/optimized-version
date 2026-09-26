/**
 * The way back for a guest who pressed 「登入後接」: to sign in, then to the page they were on with
 * the ticket open.
 */

/** Where the guest pressed the button — `window.location` will do. */
export interface ClaimReturnLocation {
  pathname: string;
  search: string;
}

export function buildClaimSignInHref(location: ClaimReturnLocation, ticketUuid: string): string {
  // The rest of the address stays — the list's filters, the map's layer and viewport — so the
  // guest comes back to what they were looking at. `id` is the site's open ticket (`route/parse.ts`),
  // and it names the one whose button was pressed, whatever the drawer showed.
  const query = new URLSearchParams(location.search);
  query.set('id', ticketUuid);

  return `/login?callbackUrl=${encodeURIComponent(`${location.pathname}?${query}`)}`;
}
