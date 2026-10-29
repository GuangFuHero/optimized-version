'use client';

import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';

import {
  buildingMapTicketsQuery,
  normalizeAddressQuery,
  reverseGeocodeQuery,
  useBuildingMap,
  useBuildingMaps,
  useBuildingMapTickets,
  useCurrentUser,
  type AdminBuildingMapFieldsFragment,
  type BoundsInput,
} from '@rescue-frontend/data-access/admin';
import type { components } from '@rescue-frontend/data-access/openapi';

import {
  lookupPoint,
  readAddressLookup,
  type AddressCheck,
  type AddressLookup,
  type LatLng,
} from '../../address-lookup';
import {
  analyzeSpace,
  toSpaceListRow,
  type SpaceAnalysis,
  type SpaceListRow,
  type SpaceTicket,
} from './space-analysis';
import type { SpaceHouseholdTarget } from './household-input';

/**
 * What the signed-in identity may do with spaces, from the backend's capability list — never the
 * role's name, so a change to the RBAC table shows without a code change (Carol, 2026-10-26).
 * Opening a space shares 新增責任區's capability. It also wants an active gov team (or a
 * platform identity); the list already leaves `work_zone.*` out for anyone else (backend
 * `authz.capabilities`), so they don't see the button.
 */
export function useSpaceCapabilities() {
  const { data } = useCurrentUser();
  const has = (perm: components['schemas']['Perm']) =>
    data?.capabilities.includes(perm) ?? false;
  return {
    canOpen: has('work_zone.add'),
    canEdit: has('work_zone.edit'),
    canDelete: has('work_zone.delete'),
    canAddTicket: has('ticket.add'),
  };
}

export interface LoadedSpace {
  building: AdminBuildingMapFieldsFragment;
  tickets: SpaceTicket[];
  analysis: SpaceAnalysis;
  row: SpaceListRow;
}

function loadedSpace(
  building: AdminBuildingMapFieldsFragment,
  tickets: SpaceTicket[],
): LoadedSpace {
  const analysis = analyzeSpace(
    building.floors.map((floor) => floor.label),
    tickets,
  );
  return {
    building,
    tickets,
    analysis,
    row: toSpaceListRow(building, analysis),
  };
}

/**
 * Every space with its tickets, ready to list. The tickets query doesn't return buildings, and a
 * building carries no status, so each space's tickets are loaded to work its row out.
 */
export function useSpaces(bounds?: BoundsInput) {
  const buildings = useBuildingMaps(bounds ? { bounds } : {});
  const items = buildings.data?.buildingMaps.items ?? NO_BUILDINGS;
  // Combined outside the render, so the result keeps its identity until a query's does change:
  // spreading each query's data into the memo's deps changed their count with the spaces.
  const tickets = useQueries({
    queries: items.map((building) =>
      buildingMapTicketsQuery({ buildingMapUuid: building.uuid }),
    ),
    combine: combineSpaceTickets,
  });

  const spaces = useMemo(
    () =>
      items.map((building, index) =>
        loadedSpace(building, tickets.data[index]?.buildingMapTickets ?? []),
      ),
    [items, tickets.data],
  );

  return {
    spaces,
    /** The list stopped at its limit: there are spaces past it. */
    moreSpaces: buildings.data?.buildingMaps.pageInfo.hasNextPage ?? false,
    isLoading: buildings.isPending || tickets.isPending,
    error: buildings.error ?? tickets.error,
  };
}

const NO_BUILDINGS: AdminBuildingMapFieldsFragment[] = [];

function combineSpaceTickets<T>(
  results: { data: T | undefined; isPending: boolean; error: Error | null }[],
) {
  return {
    data: results.map((query) => query.data),
    isPending: results.some((query) => query.isPending),
    error: results.find((query) => query.error)?.error ?? null,
  };
}

/** One space with its tickets, for the floor view. `space` is null once it's gone. */
export function useSpace(uuid: string | null) {
  const building = useBuildingMap({ uuid: uuid ?? '' });
  const tickets = useBuildingMapTickets({ buildingMapUuid: uuid ?? '' });
  const found = building.data?.buildingMap ?? null;
  const ticketList = tickets.data?.buildingMapTickets;

  const space = useMemo(
    () => (found ? loadedSpace(found, ticketList ?? []) : null),
    [found, ticketList],
  );

  return {
    space,
    isLoading: building.isPending || tickets.isPending,
    error: building.error ?? tickets.error ?? null,
  };
}

/**
 * The space a household ticket is filed in, for its edit form: the floor stays one of the
 * building's and the address stays the building's. `loading` while it is fetched; `target` stays
 * null for a ticket in no space, or one whose building has gone.
 */
export function useHouseholdSpace(buildingMapUuid: string | null | undefined) {
  const building = useBuildingMap({ uuid: buildingMapUuid ?? '' });
  const found = building.data?.buildingMap ?? null;
  const target = useMemo<SpaceHouseholdTarget | null>(
    () =>
      found
        ? {
            uuid: found.uuid,
            name: found.name,
            floorLabels: found.floors.map((floor) => floor.label),
          }
        : null,
    [found],
  );
  // A disabled query stays pending: only a ticket in a space waits for one.
  return { target, loading: Boolean(buildingMapUuid) && building.isPending };
}

/**
 * The nearest 門牌 to the pin, asked once for each place it's put down (the small map reports a tap
 * or a drag's end, never the drag). Same answers as the site's `usePinAddressLookup`, over the admin
 * client. Null with no pin.
 */
export function useSpacePinLookup(pin: LatLng | null): AddressLookup | null {
  const point = lookupPoint(pin);
  const query = useQuery({
    ...reverseGeocodeQuery(point ?? { lat: 0, lng: 0 }),
    enabled: point !== null,
    retry: false,
    meta: { quietErrors: true },
  });

  return useMemo(
    () =>
      point
        ? readAddressLookup({
            current: true,
            fetching: query.isFetching,
            error: query.error,
            answer: query.data?.reverseGeocode,
          })
        : null,
    // `point` is rebuilt each render; its numbers are what matter.
    [point?.lat, point?.lng, query.isFetching, query.error, query.data],
  );
}

/** A typed line checked against TGOS once the address field is left. Null until then. */
export function useSpaceTypedLookup(
  check: AddressCheck | null,
): AddressLookup | null {
  const query = useQuery({
    ...normalizeAddressQuery(check ?? { address: '' }),
    enabled: check !== null,
    retry: false,
    meta: { quietErrors: true },
  });

  return useMemo(
    () =>
      check
        ? readAddressLookup({
            current: true,
            fetching: query.isFetching,
            error: query.error,
            answer: query.data?.normalizeAddress,
          })
        : null,
    [check, query.isFetching, query.error, query.data],
  );
}
