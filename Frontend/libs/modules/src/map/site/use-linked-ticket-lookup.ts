'use client';

import {
  GetLinkedTicketDocument,
  createUrqlClient,
} from '@rescue-frontend/data-access';
import { useCallback, useMemo } from 'react';
import { fetchExchange } from 'urql';

import { sessionExpiryFetch } from '../../session/end-expired-session';
import { resolveLinkedTicket, type LinkedTicket } from './linked-ticket';

const LOOKUP_QUERY_CONTEXT = {
  requestPolicy: 'network-only' as const,
  suspense: false,
};

/**
 * Asks the backend about one ticket a link names, for the map and the list alike: the ticket, or
 * why there is none (`linked-ticket.ts`). One request, both fields.
 */
export function useLinkedTicketLookup(): (
  uuid: string,
) => Promise<LinkedTicket> {
  const client = useMemo(
    () =>
      createUrqlClient({
        runtime: 'client',
        url: '/api/graphql',
        exchanges: [fetchExchange],
        fetch: sessionExpiryFetch,
        requestPolicy: 'network-only',
        suspense: false,
      }),
    [],
  );

  return useCallback(
    async (uuid: string) =>
      resolveLinkedTicket(
        uuid,
        await client
          .query(GetLinkedTicketDocument, { uuid }, LOOKUP_QUERY_CONTEXT)
          .toPromise(),
      ),
    [client],
  );
}
