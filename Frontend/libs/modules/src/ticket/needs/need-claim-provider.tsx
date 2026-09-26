'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useClient, useMutation } from 'urql';

import { ClaimNeedDocument, GetTicketDocument } from '@rescue-frontend/data-access';

import type { TicketNeed } from './need-claim';
import { readTicketNeeds, TICKET_NEEDS_QUERY_CONTEXT } from './use-ticket-needs';

interface NeedClaimContextValue {
  /** Claim one of the ticket's needs for the signed-in viewer. */
  claimNeed: (ticketUuid: string, needUuid: string) => Promise<void>;
  /** The need whose claim is on its way to the server, whichever button started it. */
  claimingNeedUuid: string | null;
}

const NeedClaimContext = createContext<NeedClaimContextValue | null>(null);

interface NeedClaimProviderProps {
  children: ReactNode;
  /** Hears a ticket's needs as they stand after a claim — for a view keeping its own copy. */
  onTicketNeedsChange?: (ticketUuid: string, needs: TicketNeed[]) => void;
}

/**
 * The one place a page's claim buttons claim through — the drawer's rows, its footer and the list's
 * rows. One place means a need reads 承接中 on every button that shows it, and one reload that every
 * view of the ticket hears.
 *
 * A refused claim is not reported on its own: the reload shows what happened, e.g. a need that
 * filled in the meantime reads 已滿.
 */
export function NeedClaimProvider({ children, onTicketNeedsChange }: NeedClaimProviderProps) {
  const client = useClient();
  const [, executeClaim] = useMutation(ClaimNeedDocument);
  const [claimingNeedUuid, setClaimingNeedUuid] = useState<string | null>(null);

  const claimNeed = useCallback(
    async (ticketUuid: string, needUuid: string) => {
      setClaimingNeedUuid(needUuid);

      try {
        await executeClaim({ taskUuid: needUuid });
        // The mutation returns the assignment, not the need, so nothing in its result tells the
        // cache that the need's `assignedCount` and `myAssignment` changed; ask the server again.
        // The drawer reads the answer from the cache; the list keeps its own copy, so it is told.
        const result = await client
          .query(
            GetTicketDocument,
            { uuid: ticketUuid },
            { ...TICKET_NEEDS_QUERY_CONTEXT, requestPolicy: 'network-only' },
          )
          .toPromise();

        if (result.data?.ticket) {
          onTicketNeedsChange?.(ticketUuid, readTicketNeeds(result.data.ticket));
        }
      } finally {
        setClaimingNeedUuid(null);
      }
    },
    [client, executeClaim, onTicketNeedsChange],
  );

  const value = useMemo(
    () => ({ claimNeed, claimingNeedUuid }),
    [claimNeed, claimingNeedUuid],
  );

  return <NeedClaimContext.Provider value={value}>{children}</NeedClaimContext.Provider>;
}

export function useNeedClaim(): NeedClaimContextValue {
  const value = useContext(NeedClaimContext);

  if (!value) {
    throw new Error('useNeedClaim needs a NeedClaimProvider above it');
  }

  return value;
}
