/**
 * 「再加一件需要的幫忙」: a requester adding one more need to their request, from its detail drawer.
 * The backend's `createTicketTask` holds the same rule — ticket.edit on the ticket — this only
 * decides who is offered it.
 */

import type { CreateTicketTaskInput } from '@rescue-frontend/data-access';

import { isTicketRequester } from '../needs/need-actions';
import { toNeedInput, type NeedDraft } from './help-request-form';

interface AddNeedTicket {
  ticketStatus?: string | null;
  ticketCreatedBy?: string | null;
  viewerId?: string | null;
}

/**
 * Its requester only, guests and volunteers never. A completed request takes one more, which opens
 * it again; one cancelled for good does not.
 */
export function canAddNeed({
  ticketStatus,
  ticketCreatedBy,
  viewerId,
}: AddNeedTicket): boolean {
  return (
    isTicketRequester(ticketCreatedBy, viewerId) && ticketStatus !== 'cancelled'
  );
}

/** Null until a kind is chosen. */
export function toCreateTicketTaskInput(
  ticketUuid: string,
  draft: NeedDraft,
): CreateTicketTaskInput | null {
  const need = toNeedInput(draft);

  return need ? { ticketUuid, ...need } : null;
}
