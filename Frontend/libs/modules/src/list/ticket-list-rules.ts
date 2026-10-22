import type { RescueMapMarkerItem } from '../map/types';
import { resolveNeedClaim, type TicketNeed } from '../ticket/needs/need-claim';
import { normalizeTicketStatusSelection } from '../ticket/status';

/** The backend's `tickets(q:)` takes 2 to 50 characters and refuses anything else. */
const SEARCH_MIN_LENGTH = 2;
const SEARCH_MAX_LENGTH = 50;

export type TicketSearch =
  | { kind: 'none' }
  /** One character: the list asks for a second rather than search. */
  | { kind: 'too-short' }
  | { kind: 'query'; q: string };

/**
 * What the list does with the header's search term on the ticket side: send it to the backend as
 * `q`, which reads the tickets' text and their needs (not just the loaded pages, as filtering here
 * did), or ask for one more character. Counted in code points, as the backend counts.
 */
export function resolveTicketSearch(search: string | undefined): TicketSearch {
  const characters = [...(search?.trim() ?? '')];

  if (characters.length === 0) {
    return { kind: 'none' };
  }

  if (characters.length < SEARCH_MIN_LENGTH) {
    return { kind: 'too-short' };
  }

  // A longer term is searched on its first 50 characters, which still finds whatever it would.
  return { kind: 'query', q: characters.slice(0, SEARCH_MAX_LENGTH).join('') };
}

const CLOSED_TICKET_STATUSES = ['completed', 'cancelled'];

function isClosedTicket(status: string | null | undefined): boolean {
  return normalizeTicketStatusSelection(status ? [status] : []).some((value) =>
    CLOSED_TICKET_STATUSES.includes(value),
  );
}

/**
 * Whether the status filter asks for finished or cancelled tickets. Someone who picks those wants to
 * see them, full needs and all, as 含已滿額 shows them (prototype `site-data.js:661-668`).
 */
export function showsClosedTickets(
  subDataTypes: readonly string[] | undefined,
): boolean {
  return normalizeTicketStatusSelection(subDataTypes ?? []).some((value) =>
    CLOSED_TICKET_STATUSES.includes(value),
  );
}

/**
 * Where a need stands for the list: still taking people, the viewer's own, or full — filled, at its
 * cap or stopped by its requester, which is what a finished ticket's needs all are. A ticket
 * cancelled by hand before statuses were derived reads open, but takes nobody.
 */
function needStanding(
  need: TicketNeed,
  ticketStatus: string | null | undefined,
) {
  if (need.myAssignment) {
    return 'mine';
  }

  if (isClosedTicket(ticketStatus)) {
    return 'full';
  }

  return resolveNeedClaim(need, { isAuthenticated: true, ticketStatus })
    .kind === 'open'
    ? 'open'
    : 'full';
}

/**
 * The order the prototype gives tickets (`site-data.js:613-650`): those still short of people
 * first, and among them one with an open rescue need. The viewer's own claim counts as open here,
 * so taking the last place does not send the card they just used down the list. Past that the
 * server's order stands — newest first, or best match when searching — as the sort is stable.
 */
function ticketRank(marker: RescueMapMarkerItem): number {
  const live = (marker.needs ?? []).filter(
    (need) => needStanding(need, marker.ticketMeta?.status) !== 'full',
  );

  if (live.length === 0) {
    return 2;
  }

  return live.some((need) => need.taskType.trim().toLowerCase() === 'rescue')
    ? 0
    : 1;
}

export interface ListedTicket {
  marker: RescueMapMarkerItem;
  /** The needs its card lists. */
  needs: readonly TicketNeed[];
}

export interface TicketList {
  tickets: ListedTicket[];
  /** Full needs, left out while 含已滿額 is off: the N of 含已滿額（N）. */
  fullNeedCount: number;
  /** The needs listed, for 共 N 筆需求. */
  needCount: number;
}

/**
 * The ticket side of the list, as the prototype draws it (`site-list.jsx:457-499`): a volunteer
 * comes to find a need still taking people, so full needs fold away until 含已滿額 is on, and a
 * ticket with nothing left to list goes with them — a finished ticket's needs are all full. The
 * viewer's own claims stay, unlike the prototype's (user, 2026-10-23): taking the last place must
 * not make the line vanish. A ticket with no needs at all is listed as before, unless finished.
 *
 * With `q`, a need named by it is what the volunteer is after: only those needs are listed. A ticket
 * the backend matched on its title or description, naming no need, keeps all of them.
 */
export function listTickets(
  markers: readonly RescueMapMarkerItem[],
  { showFull, q }: { showFull: boolean; q?: string },
): TicketList {
  const term = q?.toLowerCase();
  const tickets: ListedTicket[] = [];
  let fullNeedCount = 0;
  let needCount = 0;

  for (const marker of [...markers].sort(
    (a, b) => ticketRank(a) - ticketRank(b),
  )) {
    const needs = marker.needs ?? [];

    if (needs.length === 0) {
      if (showFull || !isClosedTicket(marker.ticketMeta?.status)) {
        tickets.push({ marker, needs });
      }

      continue;
    }

    const named = term
      ? needs.filter((need) => need.taskName.toLowerCase().includes(term))
      : [];
    const candidates = named.length > 0 ? named : needs;
    const full = candidates.filter(
      (need) => needStanding(need, marker.ticketMeta?.status) === 'full',
    );
    const listed = showFull
      ? candidates
      : candidates.filter((need) => !full.includes(need));

    fullNeedCount += full.length;

    if (listed.length > 0) {
      tickets.push({ marker, needs: listed });
      needCount += listed.length;
    }
  }

  return { tickets, fullNeedCount, needCount };
}
