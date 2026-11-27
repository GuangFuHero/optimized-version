// SPDX-License-Identifier: GPL-3.0-only
import { safeReturnPath } from '../auth/login/utils/return-path';

const HOME_PATH = '/';

/**
 * A whole-page load of `href`, where client-side navigation would not do: the page's query cache
 * must go (signing in or out), or the backend takes the browser on (to Google or LINE). `href` is
 * checked once more here, and anything that is not a path on this site loads the home page instead.
 */
export function loadPage(href: string): void {
  window.location.assign(safeReturnPath(href, HOME_PATH));
}
