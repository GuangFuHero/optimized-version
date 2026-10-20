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

/** What `createTicketTask` answers, as `CreateTicketTask` in `tickets.graphql` reads it. */
export type CreateTicketTaskAnswer =
  | { __typename: 'TicketTaskCreated' }
  | {
      __typename: 'DuplicatesSuspected';
      suspects: ReadonlyArray<{
        relatedUuid: string;
        relatedTicketUuid?: string | null;
      }>;
    };

/** Another ticket with open needs the one being added looks like. */
export interface SuspectTicket {
  ticketUuid: string;
  /** Which of its needs. */
  needUuids: string[];
}

export type AddNeedOutcome =
  | { kind: 'added' }
  | {
      kind: 'held';
      tickets: SuspectTicket[];
      /**
       * What 不是同一件，加上去 sends as `acknowledgedDuplicateOf`. Any suspect will do: the backend
       * then takes the whole need as looked at (`dedup_submission.py` `submit_new_task`).
       */
      acknowledge: string;
    };

/**
 * Added, or held with nothing added: the backend found open needs of other tickets it looks like —
 * never the ticket's own. One entry per ticket, in the order the backend ranked them.
 */
export function readAddNeedOutcome(
  answer: CreateTicketTaskAnswer,
): AddNeedOutcome {
  if (answer.__typename === 'TicketTaskCreated') {
    return { kind: 'added' };
  }

  const tickets: SuspectTicket[] = [];

  for (const { relatedUuid, relatedTicketUuid } of answer.suspects) {
    if (!relatedTicketUuid) {
      continue;
    }

    const ticket = tickets.find(
      (item) => item.ticketUuid === relatedTicketUuid,
    );

    if (ticket) {
      ticket.needUuids.push(relatedUuid);
    } else {
      tickets.push({ ticketUuid: relatedTicketUuid, needUuids: [relatedUuid] });
    }
  }

  return {
    kind: 'held',
    tickets,
    acknowledge: answer.suspects[0]?.relatedUuid ?? '',
  };
}

/** Null until a kind is chosen. */
export function toCreateTicketTaskInput(
  ticketUuid: string,
  draft: NeedDraft,
): CreateTicketTaskInput | null {
  const need = toNeedInput(draft);

  return need ? { ticketUuid, ...need } : null;
}
