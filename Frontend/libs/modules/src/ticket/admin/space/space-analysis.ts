/**
 * How a space is doing, worked out from its tickets: the backend keeps no status for a building
 * (BE-036 point 4). Rules are the designer's (`Design/後台/js/admin/ticket/tk-space.jsx`
 * `floorState`, `analyze`, `spaceItems`; `Design/後台/docs/任務管理.md` §開啟空間 3 and 6).
 */

import type {
  AdminBuildingMapFieldsFragment,
  AdminSpaceTicketFieldsFragment,
} from '@rescue-frontend/data-access/admin';

import { matchFloor, orderFloors } from './floors';

export type SpaceTicket = AdminSpaceTicketFieldsFragment;

/** In order of urgency: a floor is the first of these that applies. */
export type FloorState = 'need' | 'progress' | 'done' | 'empty';

export const FLOOR_STATE_LABEL: Record<FloorState, string> = {
  need: '還需要幫忙',
  progress: '處理中',
  done: '都完成',
  empty: '沒有任務單',
};

export type SpacePriority = 'critical' | 'high' | 'medium' | 'low';

const PRIORITY_RANK: Record<SpacePriority, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const isCancelled = (ticket: SpaceTicket) =>
  ticket.status === 'cancelled' || ticket.status === 'canceled';
const isCompleted = (ticket: SpaceTicket) => ticket.status === 'completed';
const hasOpenNeed = (ticket: SpaceTicket) =>
  !isCompleted(ticket) &&
  ticket.tasks.some((task) => task.status === 'pending');

/** A cancelled ticket doesn't count: a floor with only that has no tickets. */
export function floorState(tickets: readonly SpaceTicket[]): FloorState {
  const live = tickets.filter((ticket) => !isCancelled(ticket));
  if (!live.length) return 'empty';
  if (live.some((ticket) => ticket.status === 'pending' || hasOpenNeed(ticket)))
    return 'need';
  if (live.some((ticket) => ticket.status === 'in_progress')) return 'progress';
  return 'done';
}

export interface SpaceFloor {
  label: string;
  state: FloorState;
  tickets: SpaceTicket[];
}

export interface SpaceAnalysis {
  /** Every floor of the building, in screen order. */
  floors: SpaceFloor[];
  /** Tickets whose reporter didn't know the floor. */
  noFloor: SpaceTicket[];
  /** Tickets whose floor isn't one of the building's, e.g. after its floor count went down. */
  offList: SpaceTicket[];
  /** Every ticket that counts: all but the cancelled. */
  members: SpaceTicket[];
  /** How many floors are in each state. */
  counts: Record<FloorState, number>;
  overall: FloorState;
}

export function analyzeSpace(
  floorLabels: readonly string[],
  tickets: readonly SpaceTicket[],
): SpaceAnalysis {
  const labels = orderFloors(floorLabels);
  const members = tickets.filter((ticket) => !isCancelled(ticket));
  const byFloor = new Map<string, SpaceTicket[]>(
    labels.map((label) => [label, []]),
  );
  const noFloor: SpaceTicket[] = [];
  const offList: SpaceTicket[] = [];

  for (const ticket of members) {
    const { floor, raw } = matchFloor(ticket.secondaryLocation?.floor, labels);
    if (floor) byFloor.get(floor)?.push(ticket);
    else if (raw) offList.push(ticket);
    else noFloor.push(ticket);
  }

  const floors = labels.map((label) => {
    const onFloor = byFloor.get(label) ?? [];
    return { label, state: floorState(onFloor), tickets: onFloor };
  });
  const counts: Record<FloorState, number> = {
    need: 0,
    progress: 0,
    done: 0,
    empty: 0,
  };
  for (const floor of floors) counts[floor.state] += 1;

  // Tickets without a floor of the building still say whether the building needs help.
  const elsewhere = floorState([...noFloor, ...offList]);
  const overall: FloorState = !members.length
    ? 'empty'
    : counts.need || elsewhere === 'need'
      ? 'need'
      : counts.progress || elsewhere === 'progress'
        ? 'progress'
        : 'done';

  return { floors, noFloor, offList, members, counts, overall };
}

/** One line for the whole building: 「14 層 · 6 張任務單 · 2 層還需要幫忙」. */
export function spaceSummary(analysis: SpaceAnalysis): string {
  const parts = [
    `${analysis.floors.length} 層`,
    `${analysis.members.length} 張任務單`,
  ];
  if (analysis.counts.need) parts.push(`${analysis.counts.need} 層還需要幫忙`);
  else if (analysis.counts.progress)
    parts.push(`${analysis.counts.progress} 層處理中`);
  else if (analysis.members.length) parts.push('都完成');
  return parts.join(' · ');
}

/**
 * A space as one row of the 任務管理 list, beside the tickets. Its priority, open needs and update
 * time come from its tickets, so it sorts by the same rules they do.
 */
export interface SpaceListRow {
  kind: 'space';
  /** The building map's uuid. */
  id: string;
  name: string;
  address: string | null;
  summary: string;
  status: FloorState;
  /** The most urgent of its tickets not yet completed; of all of them once all are; null with none. */
  priority: SpacePriority | null;
  /** Needs still recruiting on tickets not yet completed. */
  openNeeds: number;
  /** Its most recently updated ticket's time; null with none. */
  updatedAt: string | null;
  lngLat: [number, number] | null;
}

function highestPriority(
  tickets: readonly SpaceTicket[],
): SpacePriority | null {
  let best: SpacePriority | null = null;
  for (const { priority } of tickets) {
    if (!(priority in PRIORITY_RANK)) continue;
    const candidate = priority as SpacePriority;
    if (!best || PRIORITY_RANK[candidate] > PRIORITY_RANK[best])
      best = candidate;
  }
  return best;
}

function pointOf(
  geometry: AdminBuildingMapFieldsFragment['geometry'],
): [number, number] | null {
  if (geometry?.type !== 'Point') return null;
  const [lng, lat] = geometry.coordinates;
  return typeof lng === 'number' && typeof lat === 'number' ? [lng, lat] : null;
}

export function toSpaceListRow(
  building: AdminBuildingMapFieldsFragment,
  analysis: SpaceAnalysis,
): SpaceListRow {
  const { members } = analysis;
  const live = members.filter((ticket) => !isCompleted(ticket));
  const updatedAt = members.reduce<string | null>(
    (latest, ticket) =>
      ticket.updatedAt && (!latest || ticket.updatedAt > latest)
        ? ticket.updatedAt
        : latest,
    null,
  );

  return {
    kind: 'space',
    id: building.uuid,
    name: building.name,
    address: building.secondaryLocation?.fullAddress ?? null,
    summary: spaceSummary(analysis),
    status: analysis.overall,
    priority: highestPriority(live.length ? live : members),
    openNeeds: live.reduce(
      (sum, ticket) =>
        sum + ticket.tasks.filter((task) => task.status === 'pending').length,
      0,
    ),
    updatedAt,
    lngLat: pointOf(building.geometry),
  };
}

/**
 * Whether a space shows in the filtered list (designer, §開啟空間 3): every space with nothing
 * chosen; with a search alone, a space whose name or address has it; with filters, a space with a
 * ticket that passes them, or with a search too, one the search names.
 */
export function spaceRowVisible(input: {
  row: SpaceListRow;
  keyword: string;
  hasFilters: boolean;
  anyTicketPasses: boolean;
}): boolean {
  const { row, hasFilters, anyTicketPasses } = input;
  const keyword = input.keyword.trim().toLowerCase();
  const named =
    !!keyword &&
    [row.name, row.address ?? ''].some((text) =>
      text.toLowerCase().includes(keyword),
    );

  if (hasFilters) return anyTicketPasses || named;
  return keyword ? named : true;
}
