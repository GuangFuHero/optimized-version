// SPDX-License-Identifier: GPL-3.0-only
import {
  OAUTH_START_PATHS,
  siteHrefOrNull,
  withQuery,
  type PageHref,
  type SiteHref,
} from '../../../route/paths';

/**
 * Where a sign-in may send the person afterwards, from the `?callbackUrl=` it was given. Anyone
 * can write that parameter into a link, so only a path on this site is kept; next-auth's redirect
 * check did this until the login moved to the backend, which checks `return_to` again
 * (ADR-331).
 */
export function safeReturnPath(
  callbackUrl: string | null,
  fallback: PageHref,
): PageHref {
  return acceptedReturnPath(callbackUrl) ?? fallback;
}

/**
 * The `callbackUrl` a sign-in will go back to, or null when it will go to the fallback instead.
 * What the sign-in pages say about going back (`returnHint`, `signedInMessage`) reads this too,
 * so they never promise a page the redirect then skips.
 */
export function acceptedReturnPath(
  callbackUrl: string | null,
): SiteHref | null {
  return siteHrefOrNull(callbackUrl);
}

/**
 * The backend's start of a Google or LINE sign-in, through this app's proxy (ADR-331):
 * a whole-page navigation, which ends back on `return_to`, signed in — or on the login page
 * with `?error=` if it did not work.
 */
export function oauthStartHref(
  provider: 'google' | 'line',
  {
    app,
    callbackUrl,
    fallback,
  }: { app: 'site' | 'admin'; callbackUrl: string | null; fallback: PageHref },
): SiteHref {
  return withQuery(OAUTH_START_PATHS[provider], {
    app,
    return_to: safeReturnPath(callbackUrl, fallback),
  });
}
