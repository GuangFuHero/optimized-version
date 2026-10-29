import type { RescueMapMarkerItem } from '../map/types';
import { resolveNeedClaim, type TicketNeed } from '../ticket/needs/need-claim';
import { normalizeTicketStatusSelection } from '../ticket/status';

const CLOSED_TICKET_STATUSES = ['completed', 'cancelled'];

function isClosedTicket(status: string | null | undefined): boolean {
  return normalizeTicketStatusSelection(status ? [status] : []).some((value) =>
    CLOSED_TICKET_STATUSES.includes(value),
  );
}

function isCancelledTicket(status: string | null | undefined): boolean {
  return normalizeTicketStatusSelection(status ? [status] : []).includes(
    'cancelled',
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
 * so taking the last place does not send the card they just used down the list. The backend sends
 * every page in this order already (`order: NEEDS_FIRST`, its ADR-419); sorting again keeps it once
 * a ticket filed or claimed here changes in place. Past that the server's order stands — newest
 * first, or best match when searching — as the sort is stable. A ticket cancelled by hand stays
 * last whatever the viewer claimed on it: nobody works it any more, and the backend ranks it so.
 */
function ticketRank(marker: RescueMapMarkerItem): number {
  if (isCancelledTicket(marker.ticketMeta?.status)) {
    return 2;
  }

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

/**
 * Whether none of the newest page's tickets is listed. The backend sends tickets still taking
 * people first (`order: NEEDS_FIRST`), so once a whole page folds away every later page would too —
 * finished tickets, whose needs are all full — and the list stops asking for them: asking fetched
 * every finished ticket to show none. 含已滿額 lists them, and the asking resumes.
 */
export function pageFoldedAway(
  pageIds: readonly string[],
  listed: readonly ListedTicket[],
): boolean {
  const page = new Set(pageIds);

  return page.size > 0 && !listed.some(({ marker }) => page.has(marker.id));
}

/**
 * A count over the loaded pages. While more pages wait to load it is only a floor, so it reads N+
 * (user, 2026-10-30): scrolling down used to raise a count that looked like a total.
 */
export function countFloor(count: number, more: boolean): string {
  return more ? `${count}+` : `${count}`;
}

/**
 * The list's count: 共 N 筆需求 once everything is loaded, N+ 筆需求 while more pages wait; stations
 * name nothing (共 N 筆, N+ 筆).
 */
export function listCountLabel(
  count: number,
  { more, what = '' }: { more: boolean; what?: string },
): string {
  return more
    ? `${countFloor(count, more)} 筆${what}`
    : `共 ${count} 筆${what}`;
}
