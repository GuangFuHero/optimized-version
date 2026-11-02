/**
 * What the board's drawer offers on a ticket's needs, and how it reads what the backend says
 * back: the ⋯ of each need, the dedup answer of 再加一項需求, and a refusal's 403.
 */

import type { ClaimError } from '../../../needs/claim-error';
import {
  OPEN_TASK_STATUSES,
  type TaskRow,
  type TicketStatus,
} from './ticket-row';

export type TaskAction = 'stop' | 'delete';

const CLOSED_TICKET_STATUSES = new Set<string>(['completed', 'cancelled']);

/** The ticket's own flags (`viewerCan*`), scoped to that ticket. */
export interface TicketTaskPerms {
  viewerCanEdit: boolean;
  viewerCanDelete: boolean;
}

/**
 * The entries of a need's ⋯. Stop recruiting follows the backend's own checks (`stop_recruiting`,
 * under `ticket.edit` on its ticket): the need and its ticket still open, and somebody on it to keep. Delete is
 * `ticket.delete` on its ticket alone (`delete_ticket_task`), whatever the need's state.
 */
export function taskActionsFor(
  task: TaskRow,
  ticketStatus: TicketStatus,
  perms: TicketTaskPerms,
): TaskAction[] {
  const actions: TaskAction[] = [];
  if (
    perms.viewerCanEdit &&
    OPEN_TASK_STATUSES.has(task.status) &&
    !CLOSED_TICKET_STATUSES.has(ticketStatus) &&
    task.assignedCount > 0
  ) {
    actions.push('stop');
  }
  if (perms.viewerCanDelete) actions.push('delete');
  return actions;
}

/** One of the backend's dedup suspects, pinned to the draft it matched. */
export interface DuplicateSuspect {
  /** The draft task's index (`task:<i>`); -1 for the ticket draft itself (`ticket`). */
  draftIndex: number;
  relatedUuid: string;
  /** The ticket holding the related need, to link to; null when the backend gave none. */
  relatedTicketUuid: string | null;
}

export type CreateResult =
  | { kind: 'created' }
  | { kind: 'duplicates'; suspects: DuplicateSuspect[] };

function draftIndexOf(draftRef: string): number {
  const match = /^task:(\d+)$/.exec(draftRef);
  return match ? Number(match[1]) : -1;
}

/**
 * The `createTicket` / `createTicketTask` union: created (`TicketCreated`, `TicketTaskCreated`),
 * or held back with suspects (`DuplicatesSuspected`) for the user to look at before resending.
 */
export function readCreateResult(result: {
  __typename: string;
  suspects?: {
    draftRef: string;
    relatedUuid: string;
    relatedTicketUuid?: string | null;
  }[];
}): CreateResult {
  if (result.__typename !== 'DuplicatesSuspected') return { kind: 'created' };
  return {
    kind: 'duplicates',
    suspects: (result.suspects ?? []).map((suspect) => ({
      draftIndex: draftIndexOf(suspect.draftRef),
      relatedUuid: suspect.relatedUuid,
      relatedTicketUuid: suspect.relatedTicketUuid ?? null,
    })),
  };
}

/** 再加一項需求's fields, as typed. */
export interface NeedDraft {
  taskType: string;
  taskName: string;
  quantity: string;
  description: string;
}

export type NeedDraftErrors = Partial<Record<'taskName' | 'quantity', string>>;

/** The backend's rule (`QUANTITY_REQUIRED_TASK_TYPES`): a count for every type but rescue. */
export function validateNeedDraft(draft: NeedDraft): NeedDraftErrors {
  const errors: NeedDraftErrors = {};
  if (!draft.taskName.trim()) errors.taskName = '請填寫需求名稱';
  const quantity = draft.quantity.trim();
  if (!quantity) {
    if (draft.taskType !== 'rescue') errors.quantity = '請填寫數量';
  } else if (!/^\d+$/.test(quantity) || Number(quantity) < 1) {
    errors.quantity = '數量至少為 1';
  }
  return errors;
}

/** A valid draft as the backend takes a need, whether on its own or with a new ticket. */
export function buildNeedDraftInput(draft: NeedDraft) {
  const quantity = draft.quantity.trim();
  return {
    taskType: draft.taskType,
    taskName: draft.taskName.trim(),
    quantity: quantity ? Number(quantity) : null,
    taskDescription: draft.description.trim() || null,
  };
}

/** `createTicketTask`'s input for a valid draft. */
export function buildNeedInput(ticketUuid: string, draft: NeedDraft) {
  return { ticketUuid, ...buildNeedDraftInput(draft) };
}

/**
 * `updateTicketTask`'s input for a need's 進度備註 as typed, trimmed; an emptied note is cleared
 * with null. Null when it reads as the stored note already, so there is nothing to send.
 */
export function progressNoteInput(
  current: string | null,
  draft: string,
): { progressNote: string | null } | null {
  const next = draft.trim() || null;
  return next === (current?.trim() || null) ? null : { progressNote: next };
}

/** The backend's message, or '' when the error is not a GraphQL refusal. */
function graphqlMessage(error: ClaimError): string {
  return error.graphQLErrors?.[0]?.message ?? '';
}

/** Whether the refusal is a 403 (an `HTTPException` reads "403: <detail>"). */
export function isForbidden(error: ClaimError): boolean {
  return graphqlMessage(error).startsWith('403:');
}
