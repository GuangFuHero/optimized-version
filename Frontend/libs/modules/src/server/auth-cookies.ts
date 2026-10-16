/**
 * The login cookies the backend sets and reads (backend login design §4): `{prefix}_at` holds the
 * access token, `{prefix}_rt` the refresh token. The prefix tells environments apart — production
 * `wg`, staging `wgstg`, local `wgdev` — because production's `.wan-guard.com` cookies also reach
 * the staging hosts. It must match the backend's `AUTH_COOKIE_PREFIX`.
 */
export function authCookieNames() {
  const prefix = process.env.AUTH_COOKIE_PREFIX ?? 'wg';

  return { access: `${prefix}_at`, refresh: `${prefix}_rt` };
}

/**
 * The browser's Cookie header as the backend should see it. The refresh cookie is sent on every
 * request (`Path=/`, so the proxy and the middleware can refresh), but the backend only ever reads
 * it on `/auth/session*`: elsewhere it is left out, so it travels no further than it has to.
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

  if (
    backendPath === 'auth/session' ||
    backendPath.startsWith('auth/session/')
  ) {
    return cookieHeader;
  }

  const { refresh } = authCookieNames();
  const kept = cookiePairs(cookieHeader).filter(
    (pair) => !pair.startsWith(`${refresh}=`),
  );

  return kept.length > 0 ? kept.join('; ') : null;
}

/**
 * The Cookie header the browser will send once it has stored `setCookies`: each cookie they set
 * takes the place of the one by the same name. The proxy resends a request with it right after a
 * refresh, before the browser has had the new cookies.
 */
export function cookieHeaderAfter(
  cookieHeader: string,
  setCookies: readonly string[],
): string {
  const pairs = new Map(
    cookiePairs(cookieHeader).map((pair) => [cookieName(pair), pair]),
  );

  for (const setCookie of setCookies) {
    const pair = setCookie.split(';', 1)[0].trim();
    pairs.set(cookieName(pair), pair);
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
