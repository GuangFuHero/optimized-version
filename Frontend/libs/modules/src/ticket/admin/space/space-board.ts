/**
 * Spaces on the 任務管理 board (designer, `Design/後台/docs/任務管理.md` §開啟空間 3): which show under
 * the board's filters, and in what order. The board's tickets come paged and sorted from the
 * server, so the spaces sit above them on the first page, sorted among themselves by the tickets'
 * rule: priority, then people missing, then the latest update.
 */

import {
  countActiveFilters,
  type TicketFilters,
} from '../ticket-board/model/ticket-filters';
import {
  spaceRowVisible,
  type SpaceListRow,
  type SpacePriority,
  type SpaceTicket,
} from './space-analysis';

const PRIORITY_RANK: Record<SpacePriority, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/** One ticket against the board's filters, as the server applies them; the search is not one. */
export function spaceTicketPasses(
  ticket: SpaceTicket,
  filters: TicketFilters,
): boolean {
  if (filters.status && ticket.status !== filters.status) return false;
  if (filters.priority && ticket.priority !== filters.priority) return false;
  if (
    filters.taskType &&
    !ticket.tasks.some((task) => task.taskType === filters.taskType)
  )
    return false;
  if (filters.audit && ticket.auditStatus !== filters.audit) return false;
  if (filters.disaster && !ticket.disasterTypes.includes(filters.disaster))
    return false;
  return true;
}

export function sortSpaceRows(rows: readonly SpaceListRow[]): SpaceListRow[] {
  const rank = (row: SpaceListRow) =>
    row.priority ? PRIORITY_RANK[row.priority] : 0;
  return [...rows].sort(
    (a, b) =>
      rank(b) - rank(a) ||
      b.volunteerGap - a.volunteerGap ||
      (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''),
  );
}

/** The spaces the board lists under `filters`, in order. */
export function visibleSpaceRows(
  spaces: readonly { row: SpaceListRow; tickets: readonly SpaceTicket[] }[],
  filters: TicketFilters,
): SpaceListRow[] {
  const hasFilters = countActiveFilters(filters) > 0;
  return sortSpaceRows(
    spaces
      .filter((space) =>
        spaceRowVisible({
          row: space.row,
          keyword: filters.q,
          hasFilters,
          anyTicketPasses: space.tickets.some((ticket) =>
            spaceTicketPasses(ticket, filters),
          ),
        }),
      )
      .map((space) => space.row),
  );
}
