import { createUrqlClient } from '@rescue-frontend/data-access';
import { fetchExchange } from 'urql';

import { sessionExpiryFetch } from '../../session/end-expired-session';

/**
 * The site map's own client: every read goes to the network, nothing suspends, and an expired
 * session is ended on the way (`sessionExpiryFetch`). Shared by the map's data and a cell's tickets.
 */
export function createSiteMapClient() {
  return createUrqlClient({
    runtime: 'client',
    url: '/api/graphql',
    exchanges: [fetchExchange],
    fetch: sessionExpiryFetch,
    requestPolicy: 'network-only',
    suspense: false,
  });
}

/** Per read: from the network, without suspending the page. */
export const SITE_MAP_QUERY_CONTEXT = {
  requestPolicy: 'network-only' as const,
  suspense: false,
};
