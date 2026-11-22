// SPDX-License-Identifier: GPL-3.0-only
/**
 * The pages code sends people to, and the one way to put a query after them that a whole-page
 * navigation (`loadPage`, `navigate.ts`) accepts. Import-free: the server's pages, the browser and
 * `session/expiry.ts`, which must stay import-free itself, all read it.
 */

/** The root of either app: the site goes on to the map, the back office to its dashboard. */
export const HOME_PATH = '/';

/** The public site's pages. The back office's sign-in pages have the same paths. */
export const SITE_PATHS = {
  map: '/map',
  login: '/login',
  register: '/register',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
  signedIn: '/signed-in',
  accountSecurity: '/account/security',
} as const;

/** The back office's own pages (`apps/admin`). */
export const ADMIN_PATHS = {
  dashboard: '/dashboard',
} as const;

/** The backend's start of a Google or LINE sign-in, reached through this app's proxy. */
export const OAUTH_START_PATHS = {
  google: '/api/v1/auth/oauth/google/start',
  line: '/api/v1/auth/oauth/line/start',
} as const;

type ValueOf<T> = T[keyof T];

/** A page named above. */
export type AppPath =
  | typeof HOME_PATH
  | ValueOf<typeof SITE_PATHS>
  | ValueOf<typeof ADMIN_PATHS>;

declare const siteHref: unique symbol;

/** An address on this site: one of the paths here with a query, or one checked by `sameSiteHref`. */
export type SiteHref = string & { readonly [siteHref]: true };

/** What a whole-page navigation takes. */
export type PageHref = AppPath | SiteHref;

/** `path` with `query` after it, or `path` alone when the query is empty. */
export function withQuery(
  path: AppPath | ValueOf<typeof OAUTH_START_PATHS>,
  query: URLSearchParams | Readonly<Record<string, string>>,
): SiteHref {
  const search = new URLSearchParams(query).toString();

  return (search ? `${path}?${search}` : path) as SiteHref;
}

/** The sign-in page, to come back to 帳號安全: where that page sends someone it finds signed out. */
export const ACCOUNT_SECURITY_SIGN_IN_HREF = withQuery(SITE_PATHS.login, {
  callbackUrl: SITE_PATHS.accountSecurity,
});

/** The back office's sign-in, to come back to its home: where its pages send someone signed out. */
export const BACK_OFFICE_SIGN_IN_HREF = withQuery(SITE_PATHS.login, {
  callbackUrl: HOME_PATH,
});

/**
 * Two made-up sites to read a path against. A path names no host of its own only if it stays on
 * whichever one it is read against: one that names a host lands there under both, and so leaves at
 * least one of them, even when the host it names is one of these.
 */
const READ_AGAINST = ['http://one.invalid', 'http://two.invalid'];

/**
 * `href` if it is a path on this site, else `fallback`. Read as the browser will read it: `//host/…`,
 * `/\host/…` and the like are paths to the eye and another site to the browser (it takes a
 * backslash for a slash, and drops tabs and newlines).
 */
export function sameSiteHref(
  href: string | null | undefined,
  fallback: PageHref,
): PageHref {
  return href?.startsWith('/') && namesNoHost(href)
    ? (href as SiteHref)
    : fallback;
}

function namesNoHost(path: string): boolean {
  return READ_AGAINST.every((site) => {
    try {
      return new URL(path, site).origin === site;
    } catch {
      return false;
    }
  });
}
