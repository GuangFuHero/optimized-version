'use client';

import { useMemo } from 'react';
import { useQuery } from 'urql';

import {
  GetTicketDocument,
  TicketFieldsFragmentDoc,
  TicketNeedFieldsFragmentDoc,
  useFragment,
  type GetTicketQuery,
} from '@rescue-frontend/data-access';

import type { TicketNeed } from './need-claim';

// Like the detail panel's: the drawer shows its own loading state instead of suspending the page.
export const TICKET_NEEDS_QUERY_CONTEXT = { suspense: false } as const;

/** A ticket's needs as `GetTicket` returns them, oldest first (the backend's `tasks_by_ticket`). */
export function readTicketNeeds(ticket: GetTicketQuery['ticket']): TicketNeed[] {
  return (ticket?.tasks ?? []).map((task) => useFragment(TicketNeedFieldsFragmentDoc, task));
}

/** The ticket's own status — a withdrawn or finished ticket closes every need on it. */
export function readTicketStatus(ticket: GetTicketQuery['ticket']): string | null {
  return ticket ? useFragment(TicketFieldsFragmentDoc, ticket).status : null;
}

/**
 * A ticket read again after something changed on it: its needs, and its own status, which the
 * backend works out from them (spec Q44).
 */
export interface ReloadedTicket {
  needs: TicketNeed[];
  ticketStatus: string | null;
}

/**
 * A ticket's needs and its status, from the same `GetTicket` the detail panel runs — urql shares
 * one request between them, so the drawer footer does not fetch the ticket twice.
 */
export function useTicketNeeds(ticketUuid: string) {
  const [{ data }] = useQuery({
    query: GetTicketDocument,
    variables: { uuid: ticketUuid },
    pause: !ticketUuid,
    context: TICKET_NEEDS_QUERY_CONTEXT,
  });

  return useMemo(() => {
    const ticket = data?.ticket ?? null;

    return {
      needs: readTicketNeeds(ticket),
      ticketStatus: readTicketStatus(ticket),
    };
  }, [data?.ticket]);
}
