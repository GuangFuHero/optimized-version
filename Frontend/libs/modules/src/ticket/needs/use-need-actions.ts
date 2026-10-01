'use client';

import {
  canStopRecruiting,
  isTicketRequester,
  type NeedAction,
} from './need-actions';
import type { TicketNeed } from './need-claim';
import { useNeedClaim } from './need-claim-provider';

interface NeedActionsTicket {
  ticketUuid: string;
  /** The parent ticket's status: a closed ticket's needs cannot be stopped. */
  ticketStatus?: string | null;
  /** The ticket's `createdBy`: only its requester gets anything (spec Q45). */
  ticketCreatedBy?: string | null;
}

/**
 * What the ⋯ at the end of a need's row offers. Nothing unless the viewer filed the ticket — the
 * one place that is decided, for whatever the menu gains.
 */
export function useNeedActions(
  need: TicketNeed,
  { ticketUuid, ticketStatus, ticketCreatedBy }: NeedActionsTicket,
): NeedAction[] {
  const { viewerId, requestStopRecruiting, requestDeleteNeed } = useNeedClaim();

  if (!isTicketRequester(ticketCreatedBy, viewerId)) {
    return [];
  }

  const actions: NeedAction[] = [];

  if (canStopRecruiting(need, ticketStatus)) {
    actions.push({
      label: '停止招募',
      onSelect: () => requestStopRecruiting(ticketUuid, need.uuid),
    });
  }

  // Any need it still shows can go, a filled or stopped one included (B's S5): the requester's
  // plans can change after people signed up. Last, as what takes something away for good.
  actions.push({
    label: '刪除這筆需求',
    tone: 'danger',
    onSelect: () => requestDeleteNeed(ticketUuid, need.uuid),
  });

  return actions;
}
