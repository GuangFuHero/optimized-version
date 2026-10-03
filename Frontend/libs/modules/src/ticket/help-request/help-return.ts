/**
 * The way back for a guest who pressed 請求協助: to sign in, then to the page they were on with the
 * drawer open again, and the point they picked on the map with it. `help=1` without a
 * point, `help=<lat>,<lng>` with one. Built as A's claim does (`needs/claim-return.ts`).
 */

import type { HelpRequestSeed } from './open-help-request';

/** Where the guest pressed the button — `window.location` will do. */
export interface HelpReturnLocation {
  pathname: string;
  search: string;
}

/** What reading the way back needs of a query: `URLSearchParams`, or Next's read-only one. */
export interface HelpReturnQuery {
  get(name: string): string | null;
}

/** The drawer to open again, from where on the map if from anywhere. */
export interface HelpReturn {
  seed: HelpRequestSeed | null;
}

const HELP_KEY = 'help';

function readSeed(value: string): HelpRequestSeed | null {
  const [lat, lng, ...rest] = value.split(',').map(Number);
  const isPoint =
    rest.length === 0 &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180;

  return isPoint ? { lat, lng } : null;
}

/** A point that is not one still reopens the drawer, which then asks the device where it is. */
export function readHelpReturn(query: HelpReturnQuery): HelpReturn | null {
  const value = query.get(HELP_KEY);

  return value === null ? null : { seed: readSeed(value) };
}

/** The address without `help=` — taken off once read, so a reload or a copied link does nothing. */
export function stripHelpReturn(href: string): string {
  const url = new URL(href, 'http://site.invalid');

  // Rewriting the query re-spells what stays (`%20` as `+`): without the marker, hand the address
  // back as it came, so nothing mistakes it for a changed one.
  if (!url.searchParams.has(HELP_KEY)) {
    return href;
  }

  url.searchParams.delete(HELP_KEY);

  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * From `window.location`, not the router: the map rewrites its address in place
 * (`replaceState`), which the router's pathname does not follow — the shell's own sign-in sent
 * guests back to a bare `/map`.
 */
export function buildHelpSignInHref(
  location: HelpReturnLocation,
  seed: HelpRequestSeed | null,
): string {
  const query = new URLSearchParams(location.search);
  query.set(
    HELP_KEY,
    seed ? `${seed.lat.toFixed(6)},${seed.lng.toFixed(6)}` : '1',
  );

  return `/login?callbackUrl=${encodeURIComponent(`${location.pathname}?${query}`)}`;
}
