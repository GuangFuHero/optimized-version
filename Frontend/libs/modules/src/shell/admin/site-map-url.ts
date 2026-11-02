/**
 * The site's map, on the site's origin (`SITE_APP_URL`), for the back office's ways back to it. Null
 * without an origin, or when the value names no web URL (no scheme: `staging.wan-guard.com`,
 * `localhost:3000`), so a slip in the deploy file hides the links instead of failing every page that
 * shows them.
 */
export function siteMapUrl(siteUrl: string | undefined): string | null {
  if (!siteUrl) return null;
  try {
    const map = new URL('/map', siteUrl);
    return map.origin === 'null' ? null : map.href;
  } catch {
    return null;
  }
}
