'use client';

import { useMemo } from 'react';
import { useQuery } from 'urql';

import { GetBuildingMapsDocument } from '@rescue-frontend/data-access';

import { stationPoint } from '../station/station-point';
import { formatTicketStreet } from '../ticket/address';
import type { BuildingFloor } from './floors';

// The list and the map show their own loading line instead of suspending the page.
const BUILDING_MAPS_QUERY_CONTEXT = { suspense: false } as const;

/** The most building maps read at once: every one, there being few. */
export const BUILDING_MAP_LIMIT = 200;

/** An open building map (開啟空間), without its tickets. */
export interface BuildingMapEntry {
  uuid: string;
  name: string;
  /** The street address; null when the building has none. */
  address: string | null;
  /** Its point as Leaflet's `[lat, lng]`; null when it has none, and then no marker. */
  point: [number, number] | null;
  floors: readonly Pick<BuildingFloor, 'label'>[];
}

/**
 * Every open building map (`GetBuildingMaps`), for the site's list and its map: one request between
 * them, as urql shares it. A guest gets them too. `totalCount` is how many there are, which is more than
 * `buildings` holds past `BUILDING_MAP_LIMIT`.
 */
export function useBuildingMaps() {
  const [{ data, fetching, error }] = useQuery({
    query: GetBuildingMapsDocument,
    variables: { limit: BUILDING_MAP_LIMIT },
    requestPolicy: 'cache-and-network',
    context: BUILDING_MAPS_QUERY_CONTEXT,
  });

  const buildings = useMemo<BuildingMapEntry[]>(
    () =>
      (data?.buildingMaps.items ?? []).map((map) => ({
        uuid: map.uuid,
        name: map.name,
        address: formatTicketStreet(map.secondaryLocation),
        point: stationPoint(map.geometry),
        floors: map.floors,
      })),
    [data?.buildingMaps.items],
  );

  return {
    buildings,
    totalCount: data?.buildingMaps.pageInfo.totalCount ?? null,
    loading: fetching && !data,
    error,
  };
}
