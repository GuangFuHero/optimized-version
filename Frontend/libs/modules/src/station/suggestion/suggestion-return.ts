/**
 * The way back for a guest who pressed 修改建議: to sign in, then to the page they were on with the
 * station's suggestion drawer open again (`suggest=<station uuid>`). Built as the claim's and the help
 * request's are (`ticket/needs/claim-return.ts`, `ticket/help-request/help-return.ts`).
 */

/** Where the guest pressed the button — `window.location` will do. */
export interface SuggestionReturnLocation {
  pathname: string;
  search: string;
}

/** What reading the way back needs of a query: `URLSearchParams`, or Next's read-only one. */
export interface SuggestionReturnQuery {
  get(name: string): string | null;
}

const SUGGEST_KEY = 'suggest';

/** The station whose drawer to open again, or null. */
export function readSuggestionReturn(
  query: SuggestionReturnQuery,
): string | null {
  return query.get(SUGGEST_KEY)?.trim() || null;
}

/** The address without `suggest=` — taken off once read, so a reload or a copied link does nothing. */
export function stripSuggestionReturn(href: string): string {
  const url = new URL(href, 'http://site.invalid');

  // Rewriting the query re-spells what stays (`%20` as `+`): without the marker, hand the address
  // back as it came, so nothing mistakes it for a changed one.
  if (!url.searchParams.has(SUGGEST_KEY)) {
    return href;
  }

  url.searchParams.delete(SUGGEST_KEY);

  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * From `window.location`, not the router: the map rewrites its address in place (`replaceState`).
 * The rest of the address stays — the open station among it — so the guest comes back to it.
 */
export function buildSuggestionSignInHref(
  location: SuggestionReturnLocation,
  stationUuid: string,
): string {
  const query = new URLSearchParams(location.search);
  query.set(SUGGEST_KEY, stationUuid);

  return `/login?callbackUrl=${encodeURIComponent(`${location.pathname}?${query}`)}`;
}
