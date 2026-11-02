import type { AdminTicketStatsQuery } from '@rescue-frontend/data-access/admin';

import type { TicketStatus } from './ticket-row';

export interface TicketStats {
  total: number;
  byStatus: Record<TicketStatus, number>;
  /** People still missing across open tickets. */
  gapPeople: number;
  /** Open needs still missing at least one person. */
  gapNeeds: number;
}

/** The backend's `ticketStats` (the whole board in the caller's scope), keyed the way the strip reads it. */
export function toTicketStats(
  stats: AdminTicketStatsQuery['ticketStats'],
): TicketStats {
  return {
    total: stats.total,
    byStatus: {
      pending: stats.pending,
      in_progress: stats.inProgress,
      completed: stats.completed,
      cancelled: stats.cancelled,
    },
    gapPeople: stats.gapPeople,
    gapNeeds: stats.gapNeeds,
  };
}
