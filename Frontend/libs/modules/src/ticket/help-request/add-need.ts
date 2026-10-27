/**
 * 「再加一件需要的幫忙」: a requester adding one more need to their request, from its detail drawer.
 * The backend's `createTicketTask` holds the same rule — ticket.edit on the ticket — this only
 * decides who is offered it.
 */

import type { CreateTicketTaskInput } from '@rescue-frontend/data-access';

import { isTicketRequester } from '../needs/need-actions';
import {
  groupSuspectsByTicket,
  type DuplicateSuspect,
  type SuspectTicket,
} from './duplicate-suspects';
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
      suspects: ReadonlyArray<DuplicateSuspect>;
    };

export type AddNeedOutcome =
  | { kind: 'added' }
  | {
      kind: 'held';
      tickets: SuspectTicket[];
      /**
       * What 確認不重複，加上去 sends as `acknowledgedDuplicateOf`: the suspect the backend named,
       * the only one it names for a need. It counts only for that one (ADR-400); held again for
       * another, this is that one.
       */
      acknowledge: string;
    };

/**
 * Added, or held with nothing added: the backend found open needs of other tickets it looks like —
 * never the ticket's own. One entry per ticket, in the order the backend ranked them, each like
 * `sentName`, the need's name as sent: with no point to measure from, the one reason a card gives.
 */
export function readAddNeedOutcome(
  answer: CreateTicketTaskAnswer,
  sentName: string,
): AddNeedOutcome {
  if (answer.__typename === 'TicketTaskCreated') {
    return { kind: 'added' };
  }

  return {
    kind: 'held',
    tickets: groupSuspectsByTicket(answer.suspects, () => sentName),
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
