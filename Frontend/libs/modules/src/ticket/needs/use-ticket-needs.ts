'use client';

import { useQuery } from '@tanstack/react-query';

import {
  GetTicketDocument,
  type GetTicketQuery,
} from '@rescue-frontend/data-access';

import { siteGraphqlQuery } from '../../session/site-clients';
import type { TicketNeed } from './need-claim';

/** A ticket's needs as `GetTicket` returns them, oldest first (the backend's `tasks_by_ticket`). */
export function readTicketNeeds(
  ticket: GetTicketQuery['ticket'],
): TicketNeed[] {
  return ticket?.tasks ?? [];
}

/** The ticket's own status — a withdrawn or finished ticket closes every need on it. */
export function readTicketStatus(
  ticket: GetTicketQuery['ticket'],
): string | null {
  return ticket?.status ?? null;
}

/**
 * A ticket read again after something changed on it: its needs, and its own status, which the
 * backend works out from them.
 */
export interface ReloadedTicket {
  needs: TicketNeed[];
  ticketStatus: string | null;
}

/**
 * What reading a ticket again found: the ticket as it stands, the ticket gone, or no answer to go
 * by. Only the second may take it off a page: a dropped connection is not a deletion.
 */
export type TicketReload =
  | { kind: 'found'; ticket: ReloadedTicket }
  | { kind: 'gone' }
  | { kind: 'unanswered' };

/**
 * `GetTicket` read again: its data, or the error it failed with. The server answers a deleted
 * ticket — or one past the caller's reach — with null, not with an error (`ticket` in
 * `graphql/tickets/queries.py`), so a null that came with no error is the one sign it is gone.
 */
export function readReloadedTicket(result: {
  data?: GetTicketQuery;
  error?: unknown;
}): TicketReload {
  if (result.error || !result.data) {
    return { kind: 'unanswered' };
  }

  const { ticket } = result.data;

  return ticket
    ? {
        kind: 'found',
        ticket: {
          needs: readTicketNeeds(ticket),
          ticketStatus: readTicketStatus(ticket),
        },
      }
    : { kind: 'gone' };
}

/**
 * A ticket's needs and its status, from the same `GetTicket` the detail panel runs — one request
 * between them, so the drawer footer does not fetch the ticket twice.
 */
export function useTicketNeeds(ticketUuid: string) {
  const { data } = useQuery({
    ...siteGraphqlQuery(GetTicketDocument, { uuid: ticketUuid }),
    enabled: Boolean(ticketUuid),
  });

  return (() => {
    const ticket = data?.ticket ?? null;

    return {
      needs: readTicketNeeds(ticket),
      ticketStatus: readTicketStatus(ticket),
    };
  })();
}

/**
 * `GetTicket` for a dialog about a ticket the page already shows: from the cache when it is there,
 * and updated there by the reload after a change (`NeedClaimProvider`).
 */
export function useCachedTicket(ticketUuid: string | null | undefined) {
  const { data, isFetching } = useQuery({
    ...siteGraphqlQuery(GetTicketDocument, { uuid: ticketUuid ?? '' }),
    enabled: Boolean(ticketUuid),
    staleTime: Infinity,
  });

  return { ticket: data?.ticket ?? null, fetching: isFetching };
}
