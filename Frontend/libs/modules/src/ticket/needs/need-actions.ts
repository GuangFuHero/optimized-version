/**
 * What a ticket's requester can do to one of its needs, from the ⋯ at the end of the need's row:
 * stop recruiting for it, and delete it. Nobody else gets the ⋯.
 */

import type { TicketNeed } from './need-claim';

/** One entry of a need's ⋯ menu. */
export interface NeedAction {
  label: string;
  onSelect: () => void;
  /** For what takes something away for good — deleting the need. */
  tone?: 'danger';
}

/**
 * Whether the viewer filed the ticket: its `createdBy` against the session's user id, both the
 * account's uuid. Two missing ids are no match — a guest on a ticket with no requester on record.
 */
export function isTicketRequester(
  createdBy: string | null | undefined,
  viewerId: string | null | undefined,
): boolean {
  return Boolean(viewerId) && createdBy === viewerId;
}

/**
 * Whether stopping recruitment for the need would go through — the backend's own checks
 * (`stop_recruiting`): the need and its ticket still open, and somebody on it to keep. A need
 * nobody claimed can only be deleted.
 */
export function canStopRecruiting(
  need: TicketNeed,
  ticketStatus?: string | null,
): boolean {
  const closed =
    need.status === 'fulfilled' ||
    need.status === 'canceled' ||
    ticketStatus === 'completed' ||
    ticketStatus === 'cancelled';

  return !closed && need.assignedCount > 0;
}
