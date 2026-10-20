/**
 * Where a sign-in may send the person afterwards, from the `?callbackUrl=` it was given. Anyone
 * can write that parameter into a link, so only a path on this site is kept; next-auth's redirect
 * check did this until the login moved to the backend, which checks `return_to` again
 * (ADR-331).
 */
export function safeReturnPath(
  callbackUrl: string | null,
  fallback: string,
): string {
  return callbackUrl?.startsWith('/') && staysOnThisSite(callbackUrl)
    ? callbackUrl
    : fallback;
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
  }: { app: 'site' | 'admin'; callbackUrl: string | null; fallback: string },
): string {
  const query = new URLSearchParams({
    app,
    return_to: safeReturnPath(callbackUrl, fallback),
  });

  return `/api/v1/auth/oauth/${provider}/start?${query}`;
}

const THIS_SITE = 'http://this-site.invalid';

/**
 * Read as the browser will read it: `//host/…`, `/\host/…` and the like are paths to the eye and
 * another site to the browser (it takes a backslash for a slash, and drops tabs and newlines).
 */
function staysOnThisSite(path: string): boolean {
  try {
    return new URL(path, THIS_SITE).origin === THIS_SITE;
  } catch {
    return false;
  }
}
