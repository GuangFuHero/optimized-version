import { designTokens } from '@rescue-frontend/ui';

import {
  isLocationCellId,
  locationCellId,
} from '../../../../map/location-cells';
import type { RescueMapMarkerItem } from '../../../../map/types';
import type { TicketPriority, TicketRow } from './ticket-row';

const c = designTokens.primitives.color;

/** Pin colour per priority on the admin ticket map; the legend reads the same record. */
export const TICKET_PRIORITY_PIN_COLORS: Record<TicketPriority, string> = {
  critical: c.red[500],
  high: c.orange[500],
  medium: c.amber[500],
  low: c.neutral[500],
};

/** A finished ticket stays on the map, faded. */
export function isTicketClosed(row: TicketRow): boolean {
  return row.status === 'completed' || row.status === 'cancelled';
}

/** A map marker for a ticket, or null when the ticket has no point. */
export function toTicketMarker(
  row: TicketRow,
  selected: boolean,
): RescueMapMarkerItem | null {
  if (!row.position) return null;
  return {
    id: row.uuid,
    title: row.title,
    subtitle: row.area,
    position: row.position,
    label: row.title,
    variant:
      row.priority === 'critical' || row.priority === 'high'
        ? 'urgent-ticket'
        : 'in-progress',
    detailType: 'ticket',
    locationCell: row.locationCell,
    pin: {
      color: TICKET_PRIORITY_PIN_COLORS[row.priority],
      dimmed: isTicketClosed(row),
      selected,
    },
    tooltip: { title: row.title, subtitle: row.area },
  };
}

export type MapSelection =
  | { kind: 'ticket'; uuid: string }
  | { kind: 'cell'; uuids: string[] };

/**
 * What a map selection stands for. A coarse ticket is drawn as its H3 cell (`cell:<h3>`), shared
 * with its neighbours, so a cell id is not a ticket uuid.
 */
export function resolveMapSelection(
  id: string,
  rows: readonly TicketRow[],
): MapSelection | null {
  if (rows.some((row) => row.uuid === id)) return { kind: 'ticket', uuid: id };
  if (!isLocationCellId(id)) return null;
  const uuids = rows
    .filter(
      (row) => row.locationCell && locationCellId(row.locationCell) === id,
    )
    .map((row) => row.uuid);
  if (uuids.length === 0) return null;
  return uuids.length === 1
    ? { kind: 'ticket', uuid: uuids[0] }
    : { kind: 'cell', uuids };
}
