/**
 * What the site's ways back share (`ticket/help-request/help-return.ts`, `ticket/needs/claim-return.ts`,
 * `station/suggestion/suggestion-return.ts`, `role-request/apply-return.ts`): a button that needs the
 * person signed in sends them away with a marker in the address, and the page they come back to reads
 * the marker and takes it off. Each way back keeps its own keys and how it reads them.
 */

/** What reading a query needs: `URLSearchParams`, or Next's read-only one. */
export type ReturnQuery = Pick<URLSearchParams, 'get'>;

/** Where the person was — `window.location` will do. */
export type ReturnLocation = Pick<Location, 'pathname' | 'search'>;

/** The address without `keys` — taken off once read, so a reload or a copied link does nothing. */
export function stripQueryKeys(href: string, keys: readonly string[]): string {
  const url = new URL(href, 'http://site.invalid');

  // Rewriting the query re-spells what stays (`%20` as `+`): without the markers, hand the address
  // back as it came, so nothing mistakes it for a changed one.
  if (!keys.some((key) => url.searchParams.has(key))) {
    return href;
  }

  for (const key of keys) {
    url.searchParams.delete(key);
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * The sign-in page, to come back to `location` with `params` set in its query. From
 * `window.location`, not the router: the map rewrites its address in place (`replaceState`), which
 * the router's pathname does not follow. The rest of the address stays — the map's view, the list's
 * filters — so the person comes back to what they were looking at.
 */
export function buildSignInHref(
  location: ReturnLocation,
  params: Readonly<Record<string, string>>,
): string {
  const query = new URLSearchParams(location.search);

  for (const [key, value] of Object.entries(params)) {
    query.set(key, value);
  }

  return `/login?callbackUrl=${encodeURIComponent(`${location.pathname}?${query}`)}`;
}
