import { designTokens } from '@rescue-frontend/ui';

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
