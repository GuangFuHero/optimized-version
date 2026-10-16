/**
 * The marker the site puts on every request it sends to the backend (Backend Spec/019, ADR-289).
 *
 * The site and the back office share one login, and the access token acts as one identity at a
 * time. A request carrying this header acts as the caller's own `user` grant instead, for that
 * request only, so whatever identity someone switched to in the back office, the site treats them
 * as an ordinary signed-in user. Nothing about the session changes.
 *
 * Back-office pages must reach the backend on a path that does not add it, or every back-office
 * request would act as `user`.
 */
export const SITE_REALM_HEADERS: Readonly<Record<string, string>> = {
  'X-WG-Realm': 'site',
};
