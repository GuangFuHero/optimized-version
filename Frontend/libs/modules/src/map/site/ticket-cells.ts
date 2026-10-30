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
 * The backend's refusal when counting runs past its time limit, word for word (backend
 * `ticketCells`, `app/graphql/tickets/queries.py`). It sends no error code, so this sentence is how
 * the map tells the time limit from any other failure.
 */
export const TICKET_CELLS_TIME_LIMIT_REFUSAL =
  '這個範圍的單太多，計算逾時已中止，請放大地圖再試';

/**
 * Said for any other failure: the backend's other errors come masked, in English ("Unexpected
 * error."), and zooming in would not help.
 */
export const TICKET_CELLS_FAILED_NOTICE =
  '暫時讀不到各區塊的求助筆數，請稍後再試';

export interface TicketCellsNotice {
  text: string;
  /** Only for the time limit, which zooming in gets under. */
  zoomIn: boolean;
}

type TicketCellsError = { graphQLErrors?: readonly { message: string }[] };

/** What to tell the map's reader when a read of `ticketCells` failed. */
export function ticketCellsNotice(
  error: TicketCellsError | null | undefined,
): TicketCellsNotice {
  const timedOut = (error?.graphQLErrors ?? []).some(
    ({ message }) => message.trim() === TICKET_CELLS_TIME_LIMIT_REFUSAL,
  );

  return timedOut
    ? { text: TICKET_CELLS_TIME_LIMIT_REFUSAL, zoomIn: true }
    : { text: TICKET_CELLS_FAILED_NOTICE, zoomIn: false };
}

export interface TicketCellsRead {
  cells: readonly RescueMapLocationCell[];
  notice: TicketCellsNotice | null;
}

/**
 * The cells to draw after a read of `ticketCells`, and what to say: the counted cells when it
 * worked. When it failed, `kept` and why: the caller keeps the last counted cells while the map is
 * only panned or zoomed, as they still count what the filter asks for, and passes none after the
 * filter or the layer changed, so the notice alone stands for the counts.
 */
export function readTicketCells(
  rows: readonly TicketCellRow[] | null | undefined,
  error: TicketCellsError | null | undefined,
  kept: readonly RescueMapLocationCell[],
): TicketCellsRead {
  return rows
    ? { cells: toLocationCells(rows), notice: null }
    : { cells: kept, notice: ticketCellsNotice(error) };
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
