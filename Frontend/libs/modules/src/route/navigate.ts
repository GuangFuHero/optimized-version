// SPDX-License-Identifier: GPL-3.0-only
import { HOME_PATH, sameSiteHref, type PageHref } from './paths';

/**
 * A whole-page load of `href`, where client-side navigation would not do: the page's query cache
 * must go (signing in or out), or the backend takes the browser on (to Google or LINE). The only
 * place the site leaves a page by script: `href` is checked once more here, and anything that is
 * not a path on this site loads the home page instead.
 */
export function loadPage(href: PageHref): void {
  window.location.assign(sameSiteHref(href, HOME_PATH));
}
