'use client';

import { isTicketRequester, type NeedAction } from './need-actions';
import { NeedActionsMenu } from './need-actions-menu';
import { useNeedClaim } from './need-claim-provider';

interface TicketActionsTicket {
  ticketUuid: string;
  /** The ticket's `createdBy`: only its requester gets anything. */
  ticketCreatedBy?: string | null;
}

/**
 * What the ⋯ at the top of a ticket's drawer offers — the ticket's own counterpart of
 * `useNeedActions`, deciding who gets it the same way. Nothing unless the viewer filed it.
 */
export function useTicketActions({
  ticketUuid,
  ticketCreatedBy,
}: TicketActionsTicket): NeedAction[] {
  const { viewerId, requestDeleteTicket } = useNeedClaim();

  if (!isTicketRequester(ticketCreatedBy, viewerId)) {
    return [];
  }

  // Any ticket it still shows can go, a completed one included.
  return [
    {
      label: '刪除整張單',
      tone: 'danger',
      onSelect: () => requestDeleteTicket(ticketUuid),
    },
  ];
}

/**
 * The ⋯ at the top of a ticket's drawer, beside its close button, where the team put it. The
 * need rows' menu, given the ticket's title for its accessible name; nothing at all for anyone but
 * the requester.
 */
export function TicketActionsMenu({
  ticketTitle,
  ...ticket
}: TicketActionsTicket & { ticketTitle: string }) {
  const actions = useTicketActions(ticket);

  // Up a step, level with the close button beside it.
  return (
    <NeedActionsMenu needName={ticketTitle} items={actions} sx={{ mt: -1 }} />
  );
}
