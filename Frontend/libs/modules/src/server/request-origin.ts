import { headers } from 'next/headers';

const FALLBACK_ORIGIN = 'http://localhost:3000';

/** `value`'s origin, or null when it makes no web URL (`localhost:3000` parses, with the origin `null`). */
function toOrigin(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    const { origin } = new URL(value);

    return origin === 'null' ? null : origin;
  } catch {
    return null;
  }
}

/** A forwarded header's first value: each proxy on the way may append one, `a.com, b.com`. */
function firstValue(value: string | null): string | null {
  return value?.split(',')[0]?.trim() || null;
}

/**
 * The origin a request came in on, as the browser named it: behind the proxy, its forwarded host.
 * A forwarded host that makes no URL gives way to the request's own `Host`, and that to localhost, so a
 * malformed header costs a wrong link, never the page.
 */
export function originFromHeaders(
  requestHeaders: Pick<Headers, 'get'>,
): string {
  const protocol =
    firstValue(requestHeaders.get('x-forwarded-proto')) === 'https'
      ? 'https'
      : 'http';
  const hosts = [
    firstValue(requestHeaders.get('x-forwarded-host')),
    firstValue(requestHeaders.get('host')),
  ];

  for (const host of hosts) {
    const origin = host ? toOrigin(`${protocol}://${host}`) : null;

    if (origin) {
      return origin;
    }
  }

  return FALLBACK_ORIGIN;
}

let toldUnconfigured = false;

/**
 * The site's origin, which the links and the card a page hands out are built on: `SITE_APP_URL` where
 * the deploy names it, as staging and production do, so that no request header can point them at another
 * host; without it, in local development, the one the request came in on.
 *
 * A production build without a usable `SITE_APP_URL` says so once in the container's log, and still
 * serves the page: a deploy file that drops it, or gives it no scheme, would otherwise go back to
 * trusting the request's host without anyone noticing.
 */
export function siteOrigin(
  configured: string | undefined,
  requestHeaders: Pick<Headers, 'get'>,
): string {
  const origin = toOrigin(configured);

  if (!origin && process.env.NODE_ENV === 'production' && !toldUnconfigured) {
    toldUnconfigured = true;
    console.warn(
      "SITE_APP_URL is not set to a URL: link previews and shared links take the request's host, which a client can forge.",
    );
  }

  return origin ?? originFromHeaders(requestHeaders);
}

export async function requestOriginAsync() {
  return siteOrigin(process.env.SITE_APP_URL, await headers());
}
