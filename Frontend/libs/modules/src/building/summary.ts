/**
 * What the building drawer says of each ticket and each floor, and the order it lists them in
 * (prototype `site-building.jsx`, 2026-09-20 to 09-25).
 */

import type { RescueMapMarkerItem } from '../map/types';
import { resolveNeedClaim, type TicketNeed } from '../ticket/needs/need-claim';
import { normalizeTicketStatusSelection } from '../ticket/status';
import { timeAgo } from '../time';
import { floorName, groupByFloor, type BuildingFloor } from './floors';

/** A ticket filed inside a building, as the drawer reads it. */
export interface BuildingTicket {
  /** The ticket as the map and the list hold one, for opening its detail. */
  marker: RescueMapMarkerItem;
  /**
   * One of the building's floor labels, or empty when the reporter could not say. A floor taken off
   * the building since keeps its label here.
   */
  floor: string | null;
  /** An area of the floor, or a typed room number; free text either way. */
  room: string | null;
  needs: readonly TicketNeed[];
}

const DAY = 24 * 60 * 60_000;

/** Finished. Cancelling is deleting now, and a deleted ticket is never returned. */
export function isClosedTicket(ticket: BuildingTicket): boolean {
  const status = ticket.marker.ticketMeta?.status;

  return normalizeTicketStatusSelection(status ? [status] : []).some(
    (value) => value === 'completed' || value === 'cancelled',
  );
}

const normalized = (value?: string | null) => value?.trim().toLowerCase() ?? '';

/** A search and rescue: the ticket's own type, or a rescue need on it. */
export function isRescueTicket(ticket: BuildingTicket): boolean {
  return (
    normalized(ticket.marker.ticketMeta?.taskType) === 'rescue' ||
    ticket.needs.some((need) => normalized(need.taskType) === 'rescue')
  );
}

/**
 * The needs a shortfall is counted on: people and supplies (prototype `summarizeTicket`, 09-25). A
 * rescue's 「缺 3」 is not a gap volunteers signing up can fill, and every row would turn red.
 */
function isManpowerNeed(need: TicketNeed): boolean {
  const type = normalized(need.taskType);

  return type === 'hr' || type === 'supply';
}

export interface TicketSummary {
  closed: boolean;
  /** People still missing on its open needs that said how many; 0 once it is finished. */
  lack: number;
  /**
   * The line under its status: 「缺 2」, 「人已到齊」, or 「未指定人數」 when none of its people and
   * supply needs said how many — never 「人已到齊」 for that, which would tell a coordinator a lie.
   * Null with no such needs, and once finished.
   */
  needText: string | null;
}

export function summarizeTicket(ticket: BuildingTicket): TicketSummary {
  const closed = isClosedTicket(ticket);
  const manpower = ticket.needs.filter(isManpowerNeed);
  const counted = manpower.filter(
    (need) => need.quantity != null && need.quantity > 0,
  );
  const lack = closed
    ? 0
    : counted
        .filter((need) => need.status === 'pending')
        .reduce(
          (sum, need) =>
            sum + Math.max(0, (need.quantity ?? 0) - need.assignedCount),
          0,
        );

  let needText: string | null = null;

  if (!closed && manpower.length > 0) {
    needText =
      counted.length === 0
        ? '未指定人數'
        : lack > 0
          ? `缺 ${lack}`
          : '人已到齊';
  }

  return { closed, lack, needText };
}

export interface TicketsSummary {
  /** People still missing, all of them together. */
  lack: number;
  /** Searches and rescues not finished: what a floor's header leads with. */
  rescueOpen: number;
  closedCount: number;
  ticketCount: number;
}

export function summarizeTickets(
  tickets: readonly BuildingTicket[],
): TicketsSummary {
  let lack = 0;
  let rescueOpen = 0;
  let closedCount = 0;

  for (const ticket of tickets) {
    const summary = summarizeTicket(ticket);

    lack += summary.lack;

    if (summary.closed) {
      closedCount += 1;
    } else if (isRescueTicket(ticket)) {
      rescueOpen += 1;
    }
  }

  return { lack, rescueOpen, closedCount, ticketCount: tickets.length };
}

/** A floor opens by itself with someone still to find or people still missing on it. */
export function opensByItself(tickets: readonly BuildingTicket[]): boolean {
  const summary = summarizeTickets(tickets);

  return summary.rescueOpen > 0 || summary.lack > 0;
}

const PRIORITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/**
 * A search not finished first, then those short of people, then the rest not finished, then the
 * finished. The prototype's is short → full → finished with rescue first in each (S-12), but since
 * 09-25 a rescue's shortfall counts as 0, which put someone still to find under a ticket short of
 * mud shovellers — while a floor's header and which floors open both put the rescue first. Asked of
 * the designer (uiux, 2026-10-24).
 */
function standing(ticket: BuildingTicket): number {
  const summary = summarizeTicket(ticket);

  if (summary.closed) {
    return 3;
  }

  if (isRescueTicket(ticket)) {
    return 0;
  }

  return summary.lack > 0 ? 1 : 2;
}

function priorityRank(ticket: BuildingTicket): number {
  return (
    PRIORITY_RANK[normalized(ticket.marker.ticketMeta?.priority)] ??
    PRIORITY_RANK.medium
  );
}

function createdTime(ticket: BuildingTicket): number {
  const time = Date.parse(ticket.marker.ticketMeta?.createdAt ?? '');

  return Number.isNaN(time) ? 0 : time;
}

/**
 * A floor's tickets in the drawer's order: by standing, then priority — judged by the back office,
 * not chosen by the reporter (S-5) — then newest first. Not by how long one has waited: a ticket
 * left untouched is likely out of date (Sucre, S-12).
 */
export function sortTickets(
  tickets: readonly BuildingTicket[],
): BuildingTicket[] {
  return [...tickets].sort(
    (a, b) =>
      standing(a) - standing(b) ||
      priorityRank(a) - priorityRank(b) ||
      createdTime(b) - createdTime(a),
  );
}

/**
 * Every ticket of the building flattened in the order the drawer lists them — floor by floor, then
 * the unplaced — finished ones included whether shown or not. 上一張／下一張 in a ticket's detail
 * follow it: on an order of its own, 「下一張」 would jump about (prototype `buildingTicketOrder`).
 */
export function buildingTicketOrder(
  floors: readonly BuildingFloor[],
  tickets: readonly BuildingTicket[],
): BuildingTicket[] {
  const groups = groupByFloor(floors, tickets, (ticket) => ticket.floor);

  return [
    ...groups.floors.flatMap((group) => sortTickets(group.tickets)),
    ...sortTickets(groups.unplaced),
  ];
}

/** Whether the building holds more than one kind of ticket: only then is each row's icon telling. */
export function showsTicketKinds(tickets: readonly BuildingTicket[]): boolean {
  return (
    new Set(
      tickets.map((ticket) => normalized(ticket.marker.ticketMeta?.taskType)),
    ).size > 1
  );
}

/** The row's unit chip: the room. A floor the building no longer has is said apart, in words. */
export function ticketUnitLabel(ticket: BuildingTicket): string | null {
  return ticket.room?.trim() || null;
}

/**
 * For a ticket under 未定位 that was filed on a floor — which, being unplaced, the building's floors
 * no longer include — the floor it was on (the designer, uiux 2026-10-25). Otherwise a volunteer
 * reads it as a reporter who could not say, and does not know which floor to go to.
 */
export function removedFloorNote(
  ticket: BuildingTicket,
  placed: boolean,
): string | null {
  const floor = placed ? null : ticket.floor?.trim();

  return floor ? `原本在 ${floorName(floor)}（這一層已從大樓設定移除）` : null;
}

const TAIWAN_DAY_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Taipei',
  month: 'numeric',
  day: 'numeric',
});

/**
 * When a ticket came in: how long ago within a day, its date in Taiwan after. Five days on, a column
 * of 「4 天前」 tells nothing apart (prototype `timeAgo`, 09-25 UX).
 */
export function formatTicketRowTime(
  iso: string | null | undefined,
  now: Date = new Date(),
): string | null {
  const at = iso ? new Date(iso) : null;

  if (!at || Number.isNaN(at.getTime())) {
    return null;
  }

  return now.getTime() - at.getTime() < DAY
    ? timeAgo(iso, now)
    : TAIWAN_DAY_FORMAT.format(at);
}

/**
 * The one need a row may offer 「接這筆」 on: only when the ticket has exactly one and it can be
 * taken. With two or more, pressing it would be choosing for the volunteer — they go to the detail and
 * pick (PUB-PS-166).
 */
export function quickClaimNeed(
  ticket: BuildingTicket,
  isAuthenticated: boolean,
): TicketNeed | null {
  if (ticket.needs.length !== 1) {
    return null;
  }

  const [need] = ticket.needs;
  const claim = resolveNeedClaim(need, {
    isAuthenticated,
    ticketStatus: ticket.marker.ticketMeta?.status,
  });

  return claim.action === 'claim' ? need : null;
}
