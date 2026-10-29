import type { AdminTicketFieldsFragment } from '@rescue-frontend/data-access/admin';
import { designTokens } from '@rescue-frontend/ui';

import {
  isLocationCellId,
  locationCellId,
} from '../../../../map/location-cells';
import type { RescueMapMarkerItem } from '../../../../map/types';
import { stationPoint } from '../../../../station/station-point';
import {
  TICKET_PRIORITIES,
  UNTITLED_TICKET,
  type TicketPin,
  type TicketPriority,
} from './ticket-row';

const c = designTokens.primitives.color;

/**
 * Pin colour per priority on the admin ticket map, as the design prototype has it (tk-map.jsx's
 * `PRI_HEX`): three colours, medium and low sharing the blue. Each is the token with that exact
 * hex (#D32F2F, #F57C00, #2592B9). The legend reads the same record.
 */
export const TICKET_PRIORITY_PIN_COLORS: Record<TicketPriority, string> = {
  critical: c.red[500],
  high: c.amber[500],
  medium: c.blue[400],
  low: c.blue[400],
};

/**
 * The map legend: one entry per pin colour, in priority order, naming every priority drawn in it
 * (中優先、低優先 share one).
 */
export function ticketPriorityLegend(
  label: (priority: TicketPriority) => string,
): { color: string; label: string }[] {
  const entries = new Map<string, string[]>();
  for (const priority of TICKET_PRIORITIES) {
    const color = TICKET_PRIORITY_PIN_COLORS[priority];
    entries.set(color, [...(entries.get(color) ?? []), label(priority)]);
  }
  return [...entries].map(([color, labels]) => ({
    color,
    label: labels.join('、'),
  }));
}

/** A finished ticket stays on the map, faded. */
export function isTicketClosed(row: Pick<TicketPin, 'status'>): boolean {
  return row.status === 'completed' || row.status === 'cancelled';
}

/** A map marker for a ticket, or null when the ticket has no point. */
export function toTicketMarker(row: TicketPin): RescueMapMarkerItem | null {
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
      selected: false,
    },
    tooltip: { title: row.title, subtitle: row.area },
  };
}

/**
 * The marker as the selection draws it. The marker itself is returned when nothing changes, so
 * the map keeps its layer and only a pin whose look changes is redrawn.
 */
export function withMarkerSelected(
  marker: RescueMapMarkerItem,
  selected: boolean,
): RescueMapMarkerItem {
  if (!marker.pin || marker.pin.selected === selected) return marker;
  return { ...marker, pin: { ...marker.pin, selected } };
}

/**
 * The admin 互助地圖's marker for a ticket it has just created, or null when the ticket has no
 * point. That map draws its markers by variant and fills its detail drawer from `ticketMeta`.
 */
export function toCreatedTicketMarker(
  ticket: AdminTicketFieldsFragment,
): RescueMapMarkerItem | null {
  const position = stationPoint(ticket.geometry);
  if (!position) return null;
  return {
    id: ticket.uuid,
    title: ticket.title?.trim() || UNTITLED_TICKET,
    subtitle: ticket.description?.trim() || '救災任務',
    position,
    label: ticket.status === 'in_progress' ? '處理中' : '待處理',
    variant:
      ticket.priority === 'critical' || ticket.priority === 'high'
        ? 'urgent-ticket'
        : 'in-progress',
    detailType: 'ticket',
    ticketMeta: ticket,
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
  rows: readonly TicketPin[],
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
