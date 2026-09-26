'use client';

import { useCallback, useMemo, useState } from 'react';
import { useClient, useMutation, useQuery } from 'urql';

import {
  ClaimNeedDocument,
  GetTicketDocument,
  TicketFieldsFragmentDoc,
  TicketNeedFieldsFragmentDoc,
  useFragment,
  type GetTicketQuery,
} from '@rescue-frontend/data-access';

import type { TicketNeed } from './need-claim';

// Like the detail panel's: the drawer shows its own loading state instead of suspending the page.
const NEEDS_QUERY_CONTEXT = { suspense: false } as const;

/** A ticket's needs as `GetTicket` returns them, oldest first (the backend's `tasks_by_ticket`). */
export function readTicketNeeds(ticket: GetTicketQuery['ticket']): TicketNeed[] {
  return (ticket?.tasks ?? []).map((task) => useFragment(TicketNeedFieldsFragmentDoc, task));
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
    context: NEEDS_QUERY_CONTEXT,
  });

  return useMemo(() => {
    const ticket = data?.ticket ?? null;

    return {
      needs: readTicketNeeds(ticket),
      ticketStatus: ticket ? useFragment(TicketFieldsFragmentDoc, ticket).status : null,
    };
  }, [data?.ticket]);
}

/**
 * Claim a need for the signed-in viewer, then reload the ticket so every button on it — the rows'
 * and the drawer footer's — reads the new state.
 *
 * A refused claim is not reported on its own: the reload shows what happened, e.g. a need that
 * filled in the meantime reads 已滿.
 */
export function useClaimNeed(ticketUuid: string) {
  const client = useClient();
  const [, executeClaim] = useMutation(ClaimNeedDocument);
  const [claimingNeedUuid, setClaimingNeedUuid] = useState<string | null>(null);

  const claimNeed = useCallback(
    async (needUuid: string) => {
      setClaimingNeedUuid(needUuid);

      try {
        await executeClaim({ taskUuid: needUuid });
        // The mutation returns the assignment, not the need, so nothing in its result tells the
        // cache that the need's `assignedCount` and `myAssignment` changed; ask the server again.
        await client
          .query(
            GetTicketDocument,
            { uuid: ticketUuid },
            { ...NEEDS_QUERY_CONTEXT, requestPolicy: 'network-only' },
          )
          .toPromise();
      } finally {
        setClaimingNeedUuid(null);
      }
    },
    [client, executeClaim, ticketUuid],
  );

  return { claimNeed, claimingNeedUuid };
}
