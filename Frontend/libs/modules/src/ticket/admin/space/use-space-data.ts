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

/**
 * What the signed-in identity may do with spaces, from the backend's capability list — never the
 * role's name, so a change to the RBAC table shows without a code change (Carol, 2026-10-26).
 * Opening a space shares 新增責任區's capability. The backend also wants a gov team, which the
 * capability list doesn't say: anyone else holding it gets the backend's refusal on save.
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
  const items = buildings.data?.buildingMaps.items ?? [];
  const tickets = useQueries({
    queries: items.map((building) =>
      buildingMapTicketsQuery({ buildingMapUuid: building.uuid }),
    ),
  });

  const ticketsLoading = tickets.some((query) => query.isPending);
  const ticketData = tickets.map((query) => query.data);
  const spaces = useMemo(
    () =>
      items.map((building, index) =>
        loadedSpace(building, ticketData[index]?.buildingMapTickets ?? []),
      ),
    // `ticketData` is a new array each render; its entries are what change.
    [items, ...ticketData],
  );

  return {
    spaces,
    /** The list stopped at its limit: there are spaces past it. */
    moreSpaces: buildings.data?.buildingMaps.pageInfo.hasNextPage ?? false,
    isLoading: buildings.isPending || ticketsLoading,
    error:
      buildings.error ?? tickets.find((query) => query.error)?.error ?? null,
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
