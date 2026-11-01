'use client';

import { useMemo } from 'react';

import {
  useBuildingMaps,
  type BuildingMapEntry,
} from '../../building/use-building-maps';
import { openHelpRequest } from '../../ticket/help-request/open-help-request';
import type { RescueMapMarkerItem } from '../types';
import { toBuildingMarker } from './building-markers';

export interface SiteMapBuildings {
  /** Every open building read, drawn or not: to find the one a drawer was opened for. */
  entries: readonly BuildingMapEntry[];
  /** The entries drawn on the map. */
  markers: readonly RescueMapMarkerItem[];
  /** The buildings drawn, whose tickets need no pin of their own (`pinnedBesideBuildings`). */
  drawn: ReadonlySet<string>;
}

const NONE: SiteMapBuildings = { entries: [], markers: [], drawn: new Set() };

/**
 * The open buildings the map of tickets draws (SPACE-FE-101), to anyone, a guest too, whose drawer then
 * gives floors and no counts. None on the map of stations: a building holds tickets.
 */
export function useSiteMapBuildings(shown: boolean): SiteMapBuildings {
  const { buildings } = useBuildingMaps({ enabled: shown });

  return useMemo(() => {
    if (!shown) {
      return NONE;
    }

    const markers = buildings.flatMap((building) => {
      const marker = toBuildingMarker(building);

      return marker ? [marker] : [];
    });

    return {
      entries: buildings,
      markers,
      drawn: new Set(
        buildings.filter((building) => building.point).map(({ uuid }) => uuid),
      ),
    };
  }, [buildings, shown]);
}

/**
 * 在這一層請求協助: 請求協助 at the building's point, with its address and the floor filled in. The
 * ticket so filed is not yet kept as the building's: that needs `createHelpRequest` to take it.
 */
export function requestHelpOnBuildingFloor(
  building: BuildingMapEntry,
  floor: string,
): void {
  if (!building.point) {
    return;
  }

  const [lat, lng] = building.point;

  openHelpRequest({ lat, lng, place: { address: building.address, floor } });
}

/**
 * The drawer's 在這一層請求協助 for the building open in it, the same on the map and the list: it shuts
 * the drawer and asks on the floor picked. None while no building is open, or for one with no point.
 */
export function floorHelpForOpenBuilding(
  buildings: readonly BuildingMapEntry[],
  openUuid: string | null,
  closeDrawer: () => void,
): ((floor: string) => void) | undefined {
  const building = buildings.find(
    (entry) => entry.uuid === openUuid && entry.point,
  );

  return building
    ? (floor) => {
        closeDrawer();
        requestHelpOnBuildingFloor(building, floor);
      }
    : undefined;
}
