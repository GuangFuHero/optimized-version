import type { TicketRow, TicketStatus } from './ticket-row';

export interface TicketStats {
  total: number;
  byStatus: Record<TicketStatus, number>;
  /** People still missing across open tickets. */
  gapPeople: number;
  /** Open needs still missing at least one person. */
  gapNeeds: number;
}

/** A completed or cancelled ticket needs nobody, so its needs never count as a gap. */
const CLOSED: ReadonlySet<TicketStatus> = new Set(['completed', 'cancelled']);

export function ticketStats(rows: readonly TicketRow[]): TicketStats {
  const byStatus: Record<TicketStatus, number> = {
    pending: 0,
    in_progress: 0,
    completed: 0,
    cancelled: 0,
  };
  let gapPeople = 0;
  let gapNeeds = 0;
  for (const row of rows) {
    byStatus[row.status] += 1;
    if (CLOSED.has(row.status)) continue;
    for (const task of row.tasks) {
      if (task.gap > 0) {
        gapPeople += task.gap;
        gapNeeds += 1;
      }
    }
  }
  return { total: rows.length, byStatus, gapPeople, gapNeeds };
}
