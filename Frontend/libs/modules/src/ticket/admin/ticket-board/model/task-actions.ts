/**
 * What the board's drawer offers on a ticket's needs, and how it reads what the backend says
 * back: the ⋯ of each need, the dedup answer of 再加一項需求, and the audit's refusals.
 */

import type { ClaimError } from '../../../needs/claim-error';
import type { TicketCapabilities } from '../hooks/use-ticket-capabilities';
import type { TaskRow, TicketStatus } from './ticket-row';

export type TaskAction = 'stop' | 'delete';

/** Need statuses that still take people: the backend's `OPEN_NEED_STATUSES`. */
const OPEN_NEED_STATUSES = new Set<string>(['pending', 'in_progress']);
const CLOSED_TICKET_STATUSES = new Set<string>(['completed', 'cancelled']);

/**
 * The entries of a need's ⋯. Stop recruiting follows the backend's own checks (`stop_recruiting`,
 * under `ticket.edit`): the need and its ticket still open, and somebody on it to keep. Delete is
 * `ticket.delete` alone (`delete_ticket_task`), whatever the need's state.
 */
export function taskActionsFor(
  task: TaskRow,
  ticketStatus: TicketStatus,
  caps: TicketCapabilities,
): TaskAction[] {
  const actions: TaskAction[] = [];
  if (
    caps.canEdit &&
    OPEN_NEED_STATUSES.has(task.status) &&
    !CLOSED_TICKET_STATUSES.has(ticketStatus) &&
    task.assignedCount > 0
  ) {
    actions.push('stop');
  }
  if (caps.canDelete) actions.push('delete');
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

/** The task types a need can be: `CreateTicketTaskInput.taskType`. */
export const NEED_TYPES = ['rescue', 'supply', 'medical', 'hr'] as const;

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

/** `createTicketTask`'s input for a valid draft. */
export function buildNeedInput(ticketUuid: string, draft: NeedDraft) {
  const quantity = draft.quantity.trim();
  return {
    ticketUuid,
    taskType: draft.taskType,
    taskName: draft.taskName.trim(),
    quantity: quantity ? Number(quantity) : null,
    taskDescription: draft.description.trim() || null,
    // Entered by staff from the board: official, as the ticket form's needs are.
    source: 'official',
  };
}

const STALE_AUDIT =
  'The ticket has changed since it was loaded; reload it and audit again';
const AUDIT_NOTE_REQUIRED =
  'audit_note is required when marking an audit issue';

/** The backend's message, or '' when the error is not a GraphQL refusal. */
function graphqlMessage(error: ClaimError): string {
  return error.graphQLErrors?.[0]?.message ?? '';
}

/** Whether the refusal is a 403 (an `HTTPException` reads "403: <detail>"). */
export function isForbidden(error: ClaimError): boolean {
  return graphqlMessage(error).startsWith('403:');
}

/** What the audit card says when `auditTicket` is refused. */
export function auditErrorMessage(error: ClaimError): string {
  const message = graphqlMessage(error);
  if (message === STALE_AUDIT) return '內容已更新，請重新整理後再審核';
  if (message === AUDIT_NOTE_REQUIRED) return '標記有問題時請填寫原因。';
  if (message === 'Ticket not found') return '這張求助單已經刪除了。';
  if (isForbidden(error)) return '你的帳號沒有審核權限。';
  if (error.networkError) return '連線失敗，請確認網路後再試一次。';
  return '審核失敗，請稍後再試一次。';
}
