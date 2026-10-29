/**
 * The drawer's 需求與承接 card: what it says of a need, and 指派承接 — who the picker offers, and
 * when the card offers to assign or to take someone off.
 */

import { formatTicketTypeLabel } from '../../../status';
import { OPEN_TASK_STATUSES } from './ticket-row';

/** A need's status as its card names it (the prototype's `TK_TASK_STATUS`). */
const NEED_STATUS_LABELS: Record<string, string> = {
  pending: '待承接',
  in_progress: '進行中',
  fulfilled: '已滿足',
  canceled: '已取消',
};

export function needStatusLabel(status: string): string {
  return NEED_STATUS_LABELS[status] ?? status;
}

/** The line beside the need's name: 「人力 · 需 4」, or the type alone without a quantity. */
export function needKindLine(task: {
  taskType: string;
  quantity?: number | null;
}): string {
  const kind = formatTicketTypeLabel(task.taskType);
  return task.quantity != null ? `${kind} · 需 ${task.quantity}` : kind;
}

/** 「已承接 2／4 人」, or 「已承接 2 人」 for a need that never said how many. */
export function needTakenLine(task: {
  assignedCount: number;
  quantity?: number | null;
}): string {
  return task.quantity != null
    ? `已承接 ${task.assignedCount}／${task.quantity} 人`
    : `已承接 ${task.assignedCount} 人`;
}

const CLOSED_TICKET_STATUSES = new Set(['completed', 'cancelled']);

/** What 指派承接 reads of a need. */
export interface AssignableNeed {
  status: string;
  quantity?: number | null;
  assignedCount: number;
  /** ticket.assign over this need, as assigning someone else to it is checked. */
  viewerCanAssign: boolean;
}

/**
 * Whether the card offers 指派承接: the caller may assign to the need, and the backend would take
 * one more (`_lock_task_with_room`) — the need still open, its ticket too, and room left under its
 * quantity. A need stopped by hand is fulfilled, so it is not offered either.
 */
export function canAssignNeed(
  task: AssignableNeed,
  ticketStatus: string,
): boolean {
  return (
    task.viewerCanAssign &&
    OPEN_TASK_STATUSES.has(task.status) &&
    !CLOSED_TICKET_STATUSES.has(ticketStatus) &&
    (task.quantity == null || task.assignedCount < task.quantity)
  );
}

/**
 * Whether a person's chip offers ×: the caller may take this place off (`viewerCanUnassign`), and
 * recruiting was not stopped by hand, which fixes who is on the need (ADR-292).
 */
export function canRemoveAssignee(
  task: { recruitingStoppedAt?: string | null },
  assignment: { viewerCanUnassign: boolean },
): boolean {
  return assignment.viewerCanUnassign && !task.recruitingStoppedAt;
}

/** A member of the caller's team, as `GET /admin/teams/{uuid}/members` lists them. */
export interface PickerMember {
  uuid: string;
  name: string;
  real_name?: string | null;
}

export interface PickerOption {
  value: string;
  label: string;
}

/**
 * Who the picker offers: the team's members not already on the need, in the team's order, by
 * nickname with the real name beside it where the team shows one.
 */
export function assignPickerOptions(
  members: readonly PickerMember[],
  assignments: readonly { actorUuid: string }[],
): PickerOption[] {
  const taken = new Set(assignments.map((a) => a.actorUuid));
  return members
    .filter((member) => !taken.has(member.uuid))
    .map((member) => {
      const real = member.real_name?.trim();
      return {
        value: member.uuid,
        label:
          real && real !== member.name
            ? `${member.name}（${real}）`
            : member.name,
      };
    });
}
