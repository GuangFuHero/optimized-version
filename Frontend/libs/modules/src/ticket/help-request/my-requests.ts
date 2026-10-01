/**
 * 我的任務 › 我建立的 (B's S6): the requests the viewer filed, read for how far each got (spec Q16)
 * — every status, a finished one included, since this is the record of what they asked for and
 * what came of it, not a to-do list (prototype `useMyCreatedTickets`, `site-actions.jsx:596-607`).
 */

import { formatTaiwanTime } from '../my-claims/my-claims';

/** One row of `myTickets`, as `MyTickets` in `tickets.graphql` reads it. */
export interface MyTicketRow {
  uuid: string;
  title: string;
  status: string;
  createdAt?: string | null;
  tasks: ReadonlyArray<{ status: string }>;
}

/** A filed request as the list shows it. */
export interface MyRequest {
  ticketUuid: string;
  title: string;
  /** The ticket's own status, for the badge the list and the map show it with. */
  status: string;
  /** 「建立於 9/30 14:05」, or null for a request with no time on it. */
  createdAt: string | null;
  progress: string;
}

/**
 * The need statuses that still take people — the backend's `OPEN_NEED_STATUSES`
 * (`services/ticket_status.py`), which works the ticket's status out from them. `in_progress` is
 * gone from new needs, but rows written before still carry it.
 */
const OPEN_NEED_STATUSES = new Set(['pending', 'in_progress']);

const DONE = '這張單已經完成，不再需要人手。';

/**
 * How far a request got, by its needs (Q16): how many have their people — filled, or stopped by
 * the requester — and how many are still short. A need called off before deleting existed counts
 * for neither. A request with no open need needs nobody more; a completed ticket has none, and
 * one cancelled by hand before statuses were derived is over too.
 */
export function formatRequestProgress(
  status: string,
  needs: ReadonlyArray<{ status: string }>,
): string {
  if (status === 'cancelled') {
    return '這張單已經取消，不再需要人手。';
  }

  const open = needs.filter((need) =>
    OPEN_NEED_STATUSES.has(need.status),
  ).length;
  const full = needs.filter(
    (need) =>
      !OPEN_NEED_STATUSES.has(need.status) && need.status !== 'canceled',
  ).length;

  if (status === 'completed' || open === 0) {
    return DONE;
  }

  // Not 「0 件已滿」, which reads like a fault.
  if (full === 0) {
    return `${open} 件事還缺人`;
  }

  return `${open + full} 件事：${full} 件已滿、${open} 件還缺人`;
}

/** In the order the server sends them — newest first (Q17). */
export function readMyRequests(rows: readonly MyTicketRow[]): MyRequest[] {
  return rows.map((row) => {
    const createdAt = formatTaiwanTime(row.createdAt);

    return {
      ticketUuid: row.uuid,
      title: row.title,
      status: row.status,
      createdAt: createdAt ? `建立於 ${createdAt}` : null,
      progress: formatRequestProgress(row.status, row.tasks),
    };
  });
}
