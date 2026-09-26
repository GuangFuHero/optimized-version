/**
 * Carry `?callbackUrl=` — the page a sign-in should end on — between the login and register pages,
 * so a guest who switches to registering, or back, still lands where they started. Without one,
 * each page keeps its own default.
 */
export function withCallbackUrl(
  path: string,
  callbackUrl: string | null,
): string {
  return callbackUrl
    ? `${path}?callbackUrl=${encodeURIComponent(callbackUrl)}`
    : path;
}
