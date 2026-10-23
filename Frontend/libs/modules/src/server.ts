/**
 * Server-only entry point. These modules read `next/headers` and the backend's login cookies, so
 * they stay out of the client-safe package barrel.
 */
export { authCookieNames } from './server/auth-cookies';
export {
  getBackendApiBaseUrl,
  getBackendGraphqlUrl,
} from './server/backend-api-url';
export { withClientIpAsync } from './server/client-ip';

export { SITE_REALM_HEADERS } from './server/site-realm';
export { reverseGeocode } from './server/reverse-geocode';
export {
  createBackendGraphqlHandler,
  createBackendRestHandler,
} from './server/backend-proxy';
export { refreshBeforeRenderAsync } from './server/refresh-before-render';
export {
  currentUserFromBackendAsync,
  READ_IN_BROWSER,
  type CurrentUser,
} from './server/current-user';
