'use client';

import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
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

import { claimErrorMessage } from './claim-error';
import { buildClaimSignInHref } from './claim-return';
import type { TicketNeed } from './need-claim';
import { NeedClaimDialog, type NeedClaimTarget } from './need-claim-dialog';
import { NeedClaimToast } from './need-claim-toast';
import { readTicketNeeds, TICKET_NEEDS_QUERY_CONTEXT } from './use-ticket-needs';

interface NeedClaimContextValue {
  /** Ask the signed-in viewer to confirm claiming one of the ticket's needs. */
  requestClaim: (ticketUuid: string, needUuid: string) => void;
  /**
   * Send a guest to sign in, and back to this page with the ticket open. Null until the session is
   * known to be a guest's: while it loads, a signed-in viewer's buttons read 「登入後接」 for a
   * moment, and pressing one then must not send them to sign in again.
   */
  requestSignIn: ((ticketUuid: string) => void) | null;
}

const NeedClaimContext = createContext<NeedClaimContextValue | null>(null);

interface NeedClaimProviderProps {
  children: ReactNode;
  /** Hears a ticket's needs as they stand after a claim — for a view keeping its own copy. */
  onTicketNeedsChange?: (ticketUuid: string, needs: TicketNeed[]) => void;
}

/**
 * The one place a page's claim buttons claim through — the drawer's rows, its footer and the list's
 * lines — so every entry point gets the same confirmation (Q9), the same words for a refusal and
 * the same word of success, and one reload that every view of the ticket hears. A guest's button
 * goes through here too, to sign in and come back to the ticket.
 */
export function NeedClaimProvider({ children, onTicketNeedsChange }: NeedClaimProviderProps) {
  const router = useRouter();
  const { status: sessionStatus } = useSession();
  const client = useClient();
  const [, executeClaim] = useMutation(ClaimNeedDocument);
  // Open is kept apart from what is being confirmed, so the dialog keeps its content while it
  // fades out instead of flashing 載入中 on the way.
  const [dialogOpen, setDialogOpen] = useState(false);
  const [target, setTarget] = useState<NeedClaimTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState({ open: false, needName: '' });

  const requestClaim = useCallback((ticketUuid: string, needUuid: string) => {
    setError(null);
    setTarget({ ticketUuid, needUuid });
    setDialogOpen(true);
  }, []);

  const sendToSignIn = useCallback(
    (ticketUuid: string) => router.push(buildClaimSignInHref(window.location, ticketUuid)),
    [router],
  );

  const closeDialog = useCallback(() => setDialogOpen(false), []);
  // Stable, so a re-render — the list taking in new needs — does not restart the toast's timer.
  const closeToast = useCallback(() => setToast((current) => ({ ...current, open: false })), []);

  /**
   * Ask the server for the ticket again. The mutation returns the assignment, not the need, so
   * nothing in its result tells the cache that `assignedCount` and `myAssignment` changed. The
   * drawer and this dialog read the answer from the cache; the list keeps its own copy, so it is
   * told.
   */
  const reloadNeeds = useCallback(
    async (ticketUuid: string) => {
      const result = await client
        .query(
          GetTicketDocument,
          { uuid: ticketUuid },
          { ...TICKET_NEEDS_QUERY_CONTEXT, requestPolicy: 'network-only' },
        )
        .toPromise();
      const needs = result.data?.ticket ? readTicketNeeds(result.data.ticket) : null;

      if (needs) {
        onTicketNeedsChange?.(ticketUuid, needs);
      }

      return needs;
    },
    [client, onTicketNeedsChange],
  );

  const confirmClaim = useCallback(async () => {
    if (!target) {
      return;
    }

    const { ticketUuid, needUuid } = target;

    setSubmitting(true);
    setError(null);

    try {
      const result = await executeClaim({ taskUuid: needUuid });
      // Either way: a refusal usually means the need changed under the volunteer — filled up,
      // closed — and the dialog and every button should now say so (Q29).
      const needs = await reloadNeeds(ticketUuid);

      if (result.error) {
        setError(claimErrorMessage(result.error));
        return;
      }

      setDialogOpen(false);
      setToast({
        open: true,
        needName: needs?.find((need) => need.uuid === needUuid)?.taskName ?? '這筆需求',
      });
    } finally {
      setSubmitting(false);
    }
  }, [executeClaim, reloadNeeds, target]);

  const value = useMemo(
    () => ({
      requestClaim,
      requestSignIn: sessionStatus === 'unauthenticated' ? sendToSignIn : null,
    }),
    [requestClaim, sendToSignIn, sessionStatus],
  );

  return (
    <NeedClaimContext.Provider value={value}>
      {children}
      <NeedClaimDialog
        open={dialogOpen}
        target={target}
        error={error}
        submitting={submitting}
        onCancel={closeDialog}
        onConfirm={() => void confirmClaim()}
      />
      <NeedClaimToast open={toast.open} needName={toast.needName} onClose={closeToast} />
    </NeedClaimContext.Provider>
  );
}

export function useNeedClaim(): NeedClaimContextValue {
  const value = useContext(NeedClaimContext);

  if (!value) {
    throw new Error('useNeedClaim needs a NeedClaimProvider above it');
  }

  return value;
}
