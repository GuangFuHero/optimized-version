import { cellToLatLng, isValidCell } from 'h3-js';

import {
  normalizeTicketStatusSelection,
  TICKET_STATUS_OPTIONS,
  type TicketStatusFilterValue,
} from '../../ticket/status';
import { locationCellId } from '../location-cells';
import type { RescueMapLocationCell } from '../types';

/** A row of `ticketCells` (ADR-387). */
export interface TicketCellRow {
  cell: string;
  ticketCount: number;
  urgentCount: number;
}

/**
 * The map's status filter as `ticketCells` and `tickets` take it. Leaving it out means every status,
 * and an empty list means none (coordinator 468), so a filter that picks nothing — which on the map
 * means all of them — and one that picks every status both leave it out. Picked statuses go once
 * each, in one order, so the same filter is the same query.
 */
export function ticketCellStatuses(
  subDataTypes: readonly string[] | undefined,
): TicketStatusFilterValue[] | undefined {
  const picked = normalizeTicketStatusSelection(subDataTypes ?? []);

  if (picked.length === 0 || picked.length === TICKET_STATUS_OPTIONS.length) {
    return undefined;
  }

  return [...picked].sort();
}

/**
 * What to tell the map's reader when `ticketCells` came back with an error: the backend's own
 * sentence, as for its time limit (「這個範圍的單太多…請放大地圖再試」). A request that got no answer
 * has nothing to say; the map then keeps the cells it had, as it does after a refusal.
 */
export function ticketCellsNotice(
  error: { graphQLErrors?: readonly { message: string }[] } | null | undefined,
): string | null {
  const message = error?.graphQLErrors?.[0]?.message.trim();

  return message || null;
}

/**
 * The backend's count per cell, as the cells the map draws. Each sits at its cell's centre, where
 * the backend also places its tickets (ADR-281), and comes without its tickets: opening it reads
 * them (`tickets(locationCell:)`).
 */
export function toLocationCells(
  rows: readonly TicketCellRow[],
): RescueMapLocationCell[] {
  return rows
    .filter((row) => isValidCell(row.cell))
    .map((row) => ({
      id: locationCellId(row.cell),
      cell: row.cell,
      detailType: 'cell',
      position: cellToLatLng(row.cell) as [number, number],
      variant: row.urgentCount > 0 ? 'urgent-ticket' : 'in-progress',
      count: row.ticketCount,
      members: [],
    }));
}
