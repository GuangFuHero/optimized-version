/**
 * Server-only entry point. These modules read `next/headers` and next-auth's server APIs, so they
 * stay out of the client-safe package barrel.
 */
export { authOptions } from './server/auth-options';
export { getServerAuthSession } from './server/auth-session';
export { getBackendApiBaseUrl } from './server/backend-api-url';
export { withClientIpAsync } from './server/client-ip';
export {
  applyBackendAuthResponseCookies,
  expireSessionResponse,
  type ResolvedBackendAuth,
  getBackendGraphqlUrl,
  getServerBackendAccessTokenAsync,
  refreshUnavailableResponse,
  resolveBackendAuthTokenAsync,
} from './server/server-backend-auth';

export { SITE_REALM_HEADERS } from './server/site-realm';
export { reverseGeocode } from './server/reverse-geocode';
export {
  createBackendGraphqlHandler,
  createBackendRestHandler,
} from './server/backend-proxy';
