'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useClient, useMutation } from 'urql';

import { ClaimNeedDocument, GetTicketDocument } from '@rescue-frontend/data-access';

import { onTicketChanged } from '../ticket-changes';
import { claimErrorMessage } from './claim-error';
import {
  buildClaimSignInHref,
  readClaimReturn,
  stripClaimReturn,
  type ClaimReturn,
} from './claim-return';
import { resolveNeedClaim, type TicketNeed } from './need-claim';
import { NeedClaimDialog, type NeedClaimTarget } from './need-claim-dialog';
import { NeedClaimToast } from './need-claim-toast';
import { StopRecruitingDialog, useStopRecruiting } from './stop-recruiting-dialog';
import {
  readTicketNeeds,
  readTicketStatus,
  TICKET_NEEDS_QUERY_CONTEXT,
} from './use-ticket-needs';

interface NeedClaimContextValue {
  /** Ask the signed-in viewer to confirm claiming one of the ticket's needs. */
  requestClaim: (ticketUuid: string, needUuid: string) => void;
  /**
   * Send a guest to sign in, and back to this page with the ticket open and the need offered.
   * Null until the session is known to be a guest's: while it loads, a signed-in viewer's buttons
   * read 「登入後接」 for a moment, and pressing one then must not send them to sign in again.
   */
  requestSignIn: ((ticketUuid: string, needUuid: string) => void) | null;
  /** Said by a ticket's drawer once it is up (`NeedClaimFooter`), for the offer below to wait on. */
  ticketShown: (ticketUuid: string) => void;
  /** Ask the ticket's requester to confirm stopping recruitment for one of its needs (Q39). */
  requestStopRecruiting: (ticketUuid: string, needUuid: string) => void;
  /** The signed-in account's uuid, to tell a ticket's requester by; null for a guest. */
  viewerId: string | null;
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
 * goes through here too, to sign in and come back to the ticket, and so does a requester's 停止招募
 * from a row's ⋯ (Q39), with a confirmation of its own.
 */
export function NeedClaimProvider({ children, onTicketNeedsChange }: NeedClaimProviderProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status: sessionStatus } = useSession();
  // The account's uuid — the app's auth options put it there; this library's session type does
  // not know the field.
  const sessionUser = session?.user;
  const viewerId =
    sessionUser && 'id' in sessionUser && typeof sessionUser.id === 'string'
      ? sessionUser.id
      : null;
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
    (ticketUuid: string, needUuid: string) =>
      router.push(buildClaimSignInHref(window.location, ticketUuid, needUuid)),
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
  const reloadTicket = useCallback(
    async (ticketUuid: string) => {
      const result = await client
        .query(
          GetTicketDocument,
          { uuid: ticketUuid },
          { ...TICKET_NEEDS_QUERY_CONTEXT, requestPolicy: 'network-only' },
        )
        .toPromise();
      const ticket = result.data?.ticket;

      if (!ticket) {
        return null;
      }

      const needs = readTicketNeeds(ticket);
      onTicketNeedsChange?.(ticketUuid, needs);

      return { needs, ticketStatus: readTicketStatus(ticket) };
    },
    [client, onTicketNeedsChange],
  );

  // Changed from outside this page too — a place given back in 我的任務, which lives in the
  // account menu — and then this page's views of the ticket read it again the same way.
  useEffect(
    () => onTicketChanged((ticketUuid) => void reloadTicket(ticketUuid)),
    [reloadTicket],
  );

  const stopRecruiting = useStopRecruiting(reloadTicket);

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
      const reloaded = await reloadTicket(ticketUuid);

      if (result.error) {
        setError(claimErrorMessage(result.error));
        return;
      }

      setDialogOpen(false);
      setToast({
        open: true,
        needName: reloaded?.needs.find((need) => need.uuid === needUuid)?.taskName ?? '這筆需求',
      });
    } finally {
      setSubmitting(false);
    }
  }, [executeClaim, reloadTicket, target]);

  // The need a guest pressed 「登入後接」 on, back from signing in (`claim=`). Read once, from the
  // router: on the way back the page renders before the address changes, and the site's route
  // state rewrites the address without it soon after.
  const [claimReturn] = useState(() => readClaimReturn(searchParams));
  const claimReturnStripped = useRef(false);
  const claimReturnOffered = useRef(false);
  const [shownTicketUuid, setShownTicketUuid] = useState<string | null>(null);

  /**
   * Offer the need back, as if pressed again — but only while it can still be taken: it may have
   * filled or closed while they signed in, or be theirs already. Then the drawer says so instead.
   */
  const offerReturnedClaim = useCallback(
    async ({ ticketUuid, needUuid }: ClaimReturn) => {
      const reloaded = await reloadTicket(ticketUuid);
      const need = reloaded?.needs.find((item) => item.uuid === needUuid);
      const claim = need
        ? resolveNeedClaim(need, { ticketStatus: reloaded?.ticketStatus, isAuthenticated: true })
        : null;

      if (claim?.action === 'claim') {
        requestClaim(ticketUuid, needUuid);
      }
    },
    [reloadTicket, requestClaim],
  );

  // Off the address as soon as the session is known, offered or not, so a reload or a copied link
  // does not ask again.
  useEffect(() => {
    if (!claimReturn || claimReturnStripped.current || sessionStatus === 'loading') {
      return;
    }

    claimReturnStripped.current = true;

    const address = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const withoutClaim = stripClaimReturn(address);

    if (withoutClaim !== address) {
      window.history.replaceState(window.history.state, '', withoutClaim);
    }
  }, [claimReturn, sessionStatus]);

  // Offered once the ticket's drawer is up. Opened before it, the confirmation ends up under the
  // drawer — a modal on a phone — hidden from screen readers and out of the keyboard's reach. No
  // drawer, no offer: the ticket may be gone, or off the map's view. A guest here did not sign in —
  // the link came some other way — and has nothing to confirm.
  useEffect(() => {
    if (
      !claimReturn ||
      claimReturnOffered.current ||
      sessionStatus !== 'authenticated' ||
      shownTicketUuid !== claimReturn.ticketUuid
    ) {
      return;
    }

    claimReturnOffered.current = true;
    void offerReturnedClaim(claimReturn);
  }, [claimReturn, offerReturnedClaim, sessionStatus, shownTicketUuid]);

  const value = useMemo(
    () => ({
      requestClaim,
      requestSignIn: sessionStatus === 'unauthenticated' ? sendToSignIn : null,
      ticketShown: setShownTicketUuid,
      requestStopRecruiting: stopRecruiting.request,
      viewerId,
    }),
    [requestClaim, sendToSignIn, sessionStatus, stopRecruiting.request, viewerId],
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
      <StopRecruitingDialog {...stopRecruiting.dialogProps} />
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
