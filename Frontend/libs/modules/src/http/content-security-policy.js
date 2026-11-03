// @ts-check
// Plain CommonJS on purpose: both apps' next.config files load it as-is (the site's is CommonJS,
// the admin app's is TypeScript), before any bundler runs, so it cannot be TypeScript itself.

const CLOUDFLARE_BEACON_SCRIPT = 'https://static.cloudflareinsights.com';
const CLOUDFLARE_BEACON_REPORT = 'https://cloudflareinsights.com';

/**
 * The Content-Security-Policy both apps send, enforced.
 *
 * - script-src `'unsafe-inline'`: Next writes inline scripts into every page. Dropping it needs a
 *   per-request nonce in `proxy.ts`.
 * - script-src `'unsafe-eval'` under `next dev` only, for hot reload.
 * - script-src `https://static.cloudflareinsights.com` and connect-src `https://cloudflareinsights.com`:
 *   Cloudflare injects its Web Analytics beacon into both hosts' HTML (browsers only, not `curl`),
 *   and the beacon reports to `/cdn-cgi/rum` there. Without these, every page refuses it and
 *   Cloudflare's analytics stop. Kept on purpose; drop both if the injection is turned off.
 * - img-src `https:`: the direct OSM tiles (`tile.openstreetmap.org`) and photo links people paste
 *   (duk.tw and others), plus `data:`/`blob:` for the QR code, marker icons and downloads.
 * - style-src `'unsafe-inline'`: Emotion (MUI) and Leaflet both write inline styles.
 * - connect-src `'self'`: the browser reaches the backend only through the app's own `/api/*` proxy;
 *   TGOS, SMS, mail, OAuth tokens and the cached tile sources are all called by the backend.
 * - frame-ancestors `'self'`: the same rule as `X-Frame-Options: SAMEORIGIN`, which browsers that
 *   understand frame-ancestors ignore in its favour.
 * - form-action `'self'`: OAuth starts by navigating to `/api/v1/auth/oauth/*`, not by a form post.
 *
 * @param {boolean} [isDevelopment] defaults to whether `next dev` is running
 * @returns {string}
 */
function contentSecurityPolicy(
  isDevelopment = process.env.NODE_ENV === 'development',
) {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' ${CLOUDFLARE_BEACON_SCRIPT}${isDevelopment ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' ${CLOUDFLARE_BEACON_REPORT}`,
    "frame-ancestors 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; ');
}

module.exports = { contentSecurityPolicy };
