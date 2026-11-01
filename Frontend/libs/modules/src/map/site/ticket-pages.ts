import {
  TicketListOrder,
  type GetTicketsWithNeedsQueryVariables,
} from '@rescue-frontend/data-access';

/**
 * How many loaded tickets a further page asks for again. The list's order moves a ticket whenever a
 * place on it fills or frees up: one in the loaded pages that drops to the last tier between two
 * pages moves every ticket after it up one, and a page starting where the last one ended would open
 * one past the ticket that slid into that place, which no page then holds. The repeats are dropped
 * by id.
 *
 * It covers up to this many tickets leaving the loaded range between two page loads. Past that, the
 * next tickets in order stay unlisted until the list reloads, with nothing to say so. Stepping back
 * a page whenever the first ticket returned is not already loaded would close it, but that is a loop
 * hard to get right without a test of the paging hook, so the limit stands (HC on #178).
 */
export const TICKET_PAGE_OVERLAP = 20;

/** Where the page after `loaded` tickets starts: a little before their end (TICKET_PAGE_OVERLAP). */
export function nextTicketPageSkip(loaded: number): number {
  return Math.max(0, loaded - TICKET_PAGE_OVERLAP);
}

/**
 * What the list asks for a page of tickets with: always in the list's order across every page, not
 * only the loaded ones (backend ADR-419). The order is optional in the schema, so leaving it out
 * would still typecheck, and quietly list newest first.
 */
export function ticketPageVariables({
  status,
  q,
  skip,
  limit,
}: {
  status?: string;
  q?: string;
  skip: number;
  limit: number;
}): GetTicketsWithNeedsQueryVariables {
  return {
    bounds: undefined,
    status,
    q,
    skip,
    limit,
    order: TicketListOrder.NeedsFirst,
  };
}
