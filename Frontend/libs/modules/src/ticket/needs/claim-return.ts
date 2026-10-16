/**
 * The way back for a guest who pressed 「登入後接」: to sign in, then to the page they were on with
 * the ticket open and the need they pressed it on offered to claim (`claim=`).
 */

/** Where the guest pressed the button — `window.location` will do. */
export interface ClaimReturnLocation {
  pathname: string;
  search: string;
}

/** What reading the way back needs of a query: `URLSearchParams`, or Next's read-only one. */
export interface ClaimReturnQuery {
  get(name: string): string | null;
}

/** The need a guest signed in to claim, and its ticket. */
export interface ClaimReturn {
  ticketUuid: string;
  needUuid: string;
}

export function readClaimReturn(query: ClaimReturnQuery): ClaimReturn | null {
  const ticketUuid = query.get('id');
  const needUuid = query.get('claim');

  return ticketUuid && needUuid ? { ticketUuid, needUuid } : null;
}

/** The address without `claim=` — taken off once read, so a reload or a copied link offers nothing. */
export function stripClaimReturn(href: string): string {
  const url = new URL(href, 'http://site.invalid');

  // Rewriting the query re-spells what stays (`%20` as `+`): without a need in it, hand the
  // address back as it came, so nothing mistakes it for a changed one.
  if (!url.searchParams.has('claim')) {
    return href;
  }

  url.searchParams.delete('claim');

  return `${url.pathname}${url.search}${url.hash}`;
}

export function buildClaimSignInHref(
  location: ClaimReturnLocation,
  ticketUuid: string,
  needUuid: string,
): string {
  // The rest of the address stays — the list's filters, the map's layer and viewport — so the
  // guest comes back to what they were looking at. `id` is the site's open ticket (`route/parse.ts`),
  // and it names the one whose button was pressed, whatever the drawer showed.
  const query = new URLSearchParams(location.search);
  query.set('id', ticketUuid);
  query.set('claim', needUuid);

  return `/login?callbackUrl=${encodeURIComponent(`${location.pathname}?${query}`)}`;
}
