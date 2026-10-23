/**
 * The marker the site puts on every request it sends to the backend (Backend Spec/019, ADR-289).
 *
 * The site and the back office share one login, and the access token acts as one identity at a
 * time. A request carrying this header acts as the caller's own `user` grant instead, for that
 * request only, so whatever identity someone switched to in the back office, the site treats them
 * as an ordinary signed-in user. Nothing about the session changes.
 *
 * The back office marks its requests `admin` instead (ADR-329): the same session acts as the
 * identity switched to there, or else the caller's first back-office identity.
 */
export const REALM_HEADER = 'X-WG-Realm';

export const SITE_REALM_HEADERS: Readonly<Record<string, string>> = {
  [REALM_HEADER]: 'site',
};
