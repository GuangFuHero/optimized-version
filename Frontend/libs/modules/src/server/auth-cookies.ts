/**
 * The login cookies the backend sets and reads (ADR-326): `{prefix}_at` holds the
 * access token, `{prefix}_rt` the refresh token. The prefix tells environments apart — production
 * `wg`, staging `wgstg`, local `wgdev` — because production's `.wan-guard.com` cookies also reach
 * the staging hosts. It must match the backend's `AUTH_COOKIE_PREFIX`, and falls back on the
 * backend's default when unset: `wgdev`, so a deployment that forgot it never takes production's
 * cookies for its own.
 */
export function authCookieNames() {
  const prefix = process.env.AUTH_COOKIE_PREFIX || 'wgdev';

  return { prefix, access: `${prefix}_at`, refresh: `${prefix}_rt` };
}

/**
 * The browser's Cookie header as the backend should see it (ADR-326):
 * - only this environment's own `{prefix}_*` cookies. Production's cookies sit on `.wan-guard.com`
 *   and reach the staging hosts too; its tokens must not go on into the staging backend (or its
 *   logs). Any other site's or tool's cookie is of no use to the backend either.
 * - the refresh cookie only to `/auth/session*`. It is sent on every request (`Path=/`, so the proxy
 *   and the middleware can refresh), but the backend reads it nowhere else, so it travels no
 *   further than it has to.
 *
 * `backendPath` is the path under `/api/v1/`, e.g. `auth/session/refresh`.
 */
export function forwardedCookieHeader(
  cookieHeader: string | null,
  backendPath: string,
): string | null {
  if (!cookieHeader) {
    return null;
  }

  const { prefix, refresh } = authCookieNames();
  const toSession =
    backendPath === 'auth/session' || backendPath.startsWith('auth/session/');
  const kept = cookiePairs(cookieHeader).filter(
    (pair) =>
      pair.startsWith(`${prefix}_`) &&
      (toSession || !pair.startsWith(`${refresh}=`)),
  );

  return kept.length > 0 ? kept.join('; ') : null;
}

/**
 * The Cookie header the browser will send once it has stored `setCookies`: each cookie they set
 * takes the place of the one by the same name, and one they clear (`Max-Age=0`, how the backend
 * clears, ADR-326) is gone. The proxy resends a request with it right after a refresh, and the
 * middleware renders the page with it, before the browser has had the new cookies.
 */
export function cookieHeaderAfter(
  cookieHeader: string,
  setCookies: readonly string[],
): string {
  const pairs = new Map(
    cookiePairs(cookieHeader).map((pair) => [cookieName(pair), pair]),
  );

  for (const setCookie of setCookies) {
    const [first, ...attributes] = setCookie.split(';');
    const pair = first.trim();
    const cleared = attributes.some((attribute) =>
      /^max-age=(0|-\d+)$/i.test(attribute.trim()),
    );

    if (cleared) {
      pairs.delete(cookieName(pair));
    } else {
      pairs.set(cookieName(pair), pair);
    }
  }

  return [...pairs.values()].join('; ');
}

/** The value of the cookie called `name` in a Cookie header, if it is there. */
export function cookieValue(
  cookieHeader: string,
  name: string,
): string | undefined {
  const pair = cookiePairs(cookieHeader).find(
    (candidate) => cookieName(candidate) === name,
  );
  return pair?.slice(name.length + 1);
}

function cookiePairs(cookieHeader: string): string[] {
  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
}

function cookieName(pair: string): string {
  return pair.split('=', 1)[0];
}
