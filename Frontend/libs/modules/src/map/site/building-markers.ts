/**
 * Open buildings (開啟空間) on the site's map of tickets: one entry each, 0 tickets inside or more —
 * the way in to file the first one cannot wait for one to be there. A tap opens the building's
 * floors. Whoever may see where a ticket is sees the building's tickets inside it, not as pins of
 * their own on the same point; a guest's tickets are cells already.
 */

import type { BuildingMapEntry } from '../../building/use-building-maps';
import type { RescueMapMarkerItem } from '../types';

/** Marker ids for buildings: never a ticket's uuid, nor a location cell's `cell:` id. */
const BUILDING_MARKER_PREFIX = 'building:';

/** Null for a building with no point to draw it at. */
export function toBuildingMarker(
  building: BuildingMapEntry,
): RescueMapMarkerItem | null {
  if (!building.point) {
    return null;
  }

  return {
    id: `${BUILDING_MARKER_PREFIX}${building.uuid}`,
    title: building.name,
    subtitle: building.address ?? '',
    position: building.point,
    label: building.name,
    variant: 'in-progress',
    detailType: 'ticket',
    building: {
      uuid: building.uuid,
      ticketCount: building.ticketCount,
      shortfall: building.shortfall,
    },
  };
}

/** The building a marker stands for, or null for a ticket or a station. */
export function buildingOfMarker(marker: RescueMapMarkerItem): string | null {
  return marker.building?.uuid ?? null;
}

/**
 * The markers that keep a pin of their own: all but the tickets of a building whose entry is drawn.
 * The ticket open stays, as its drawer is read from the map's markers.
 */
export function pinnedBesideBuildings(
  markers: readonly RescueMapMarkerItem[],
  drawnBuildings: ReadonlySet<string>,
  openId?: string,
): RescueMapMarkerItem[] {
  return markers.filter((marker) => {
    const building = marker.ticketMeta?.buildingMapUuid;

    return !building || !drawnBuildings.has(building) || marker.id === openId;
  });
}
