/**
 * A space on the 任務管理 map (designer, `Design/後台/docs/任務管理.md` §開啟空間 3): one square pin
 * per space, the only square on the map, coloured as the list's priority and grey with no tickets
 * (or none in yet).
 * The tickets inside a space draw no pin of their own: they share its point.
 */

import type { RescueMapMarkerItem } from '../../../map/types';
import type { MapViewport } from '../ticket-board/model/ticket-filters';
import { TICKET_PRIORITY_PIN_COLORS } from '../ticket-board/model/ticket-marker';
import {
  isSpaceLoad,
  SPACE_LOAD_LABEL,
  type SpaceListRow,
  type SpacePriority,
} from './space-analysis';

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
    // The prototype's tipHtml for a space.
    tooltip: {
      title: `空間：${row.name}`,
      subtitle: isSpaceLoad(row.status)
        ? `任務單${SPACE_LOAD_LABEL[row.status]}`
        : `${row.ticketCount} 張任務單${
            row.needFloors ? ` · ${row.needFloors} 層還需要幫忙` : ''
          }`,
    },
  };
}

/**
 * The tickets that keep a pin of their own: all but those in a space whose square pin is on the
 * map. One whose space isn't loaded keeps its pin, so it never drops off the map.
 */
export function pinnedTickets<T extends { buildingMapUuid: string | null }>(
  rows: readonly T[],
  pinnedSpaceIds: ReadonlySet<string>,
): T[] {
  return rows.filter(
    (row) => !row.buildingMapUuid || !pinnedSpaceIds.has(row.buildingMapUuid),
  );
}

/**
 * The spaces the map's side list shows: those whose pin is inside the view, as its tickets are the
 * ones loaded for the view. None until the map has one; a space without a point has no pin to be in it.
 */
export function spacesInView(
  spaces: readonly SpaceListRow[],
  viewport: MapViewport | null,
): SpaceListRow[] {
  if (!viewport) return [];
  return spaces.filter(({ lngLat }) => {
    if (!lngLat) return false;
    const [lng, lat] = lngLat;
    return (
      lng >= viewport.west &&
      lng <= viewport.east &&
      lat >= viewport.south &&
      lat <= viewport.north
    );
  });
}
