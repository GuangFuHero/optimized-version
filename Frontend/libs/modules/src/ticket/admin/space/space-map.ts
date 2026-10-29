/**
 * A space on the 任務管理 map (designer, `Design/後台/docs/任務管理.md` §開啟空間 3): one square pin
 * per space, the only square on the map, coloured as the list's priority and grey with no tickets.
 * The tickets inside a space draw no pin of their own: they share its point.
 */

import type { BadgeTone } from '@rescue-frontend/ui';

import type { RescueMapMarkerItem } from '../../../map/types';
import { TICKET_PRIORITY_PIN_COLORS } from '../ticket-board/model/ticket-marker';
import type { FloorState, SpaceListRow, SpacePriority } from './space-analysis';

/** A space's state as a badge, on the list row and the map card. */
export const FLOOR_STATE_TONE: Record<FloorState, BadgeTone> = {
  need: 'danger',
  progress: 'warning',
  done: 'success',
  empty: 'neutral',
};

/** A space with no ticket that counts. */
export const SPACE_PIN_EMPTY = '#64748B';

/** The legend's entry for the square pin. */
export const SPACE_LEGEND_LABEL = '開啟的空間';

/** Marker ids for spaces: never a ticket uuid, nor a location cell's `cell:` id. */
const SPACE_MARKER_PREFIX = 'space:';

export function spacePinColor(priority: SpacePriority | null): string {
  return priority ? TICKET_PRIORITY_PIN_COLORS[priority] : SPACE_PIN_EMPTY;
}

/** The space a marker id stands for, or null for any other marker. */
export function spaceIdOfMarker(markerId: string): string | null {
  return markerId.startsWith(SPACE_MARKER_PREFIX)
    ? markerId.slice(SPACE_MARKER_PREFIX.length)
    : null;
}

/** Null for a space without a point. Faded once every ticket in it is done, as a closed ticket is. */
export function toSpaceMarker(row: SpaceListRow): RescueMapMarkerItem | null {
  if (!row.lngLat) return null;
  const [lng, lat] = row.lngLat;
  return {
    id: `${SPACE_MARKER_PREFIX}${row.id}`,
    title: row.name,
    subtitle: row.address ?? '',
    position: [lat, lng],
    label: row.name,
    variant: 'in-progress',
    detailType: 'ticket',
    pin: {
      shape: 'square',
      color: spacePinColor(row.priority),
      dimmed: row.status === 'done',
      selected: false,
    },
    tooltip: row.address
      ? { title: row.name, subtitle: row.address }
      : { title: row.name },
  };
}
