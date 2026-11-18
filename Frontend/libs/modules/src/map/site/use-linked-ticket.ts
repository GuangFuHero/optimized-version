'use client';

import { useQuery } from '@tanstack/react-query';

import { GetLinkedTicketDocument } from '@rescue-frontend/data-access';

import { siteGraphqlQuery } from '../../session/site-clients';
import { resolveLinkedTicket, type LinkedTicket } from './linked-ticket';

/**
 * What the backend says about one ticket a link names, for the map and the list alike: the ticket,
 * or why there is none (`linked-ticket.ts`). One request, both fields, read fresh; null while it is
 * on its way, and for no uuid.
 */
export function useLinkedTicket(uuid: string | null): LinkedTicket | null {
  const { data, error, isError, isFetching } = useQuery({
    ...siteGraphqlQuery(GetLinkedTicketDocument, { uuid: uuid ?? '' }),
    enabled: uuid !== null,
    networkMode: 'always',
  });

  if (!uuid || isFetching) {
    return null;
  }

  return data || isError ? resolveLinkedTicket(uuid, { data, error }) : null;
}
