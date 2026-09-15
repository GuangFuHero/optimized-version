/**
 * Server-only entry point.
 *
 * Everything here depends on node built-ins. Importing it from a client component breaks the build,
 * which is the point — the package barrel stays isomorphic.
 */
export { resolveClientIp, runWithClientIp } from './rest/client-ip-context';
