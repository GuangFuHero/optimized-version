import { headers } from 'next/headers';

/**
 * The origin a request came in on, as the browser named it: behind the proxy, its forwarded host.
 * A link or an image a page hands out is built from it, so staging and production can run the same
 * build.
 */
export function originFromHeaders(requestHeaders: Pick<Headers, 'get'>) {
  const host =
    requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  const protocol = requestHeaders.get('x-forwarded-proto') ?? 'http';

  // A browser's request always names its host; the fallback is for one that does not.
  return host ? `${protocol}://${host}` : 'http://localhost:3000';
}

export async function requestOriginAsync() {
  return originFromHeaders(await headers());
}
