// SPDX-License-Identifier: GPL-3.0-only
'use client';

import { useQueries, useQuery } from '@tanstack/react-query';

import {
  buildingMapTicketsQuery,
  SILENT_ERROR_META,
  useBuildingMap,
  useBuildingMaps,
  useCurrentUser,
  type AdminBuildingMapFieldsFragment,
  type BoundsInput,
} from '@rescue-frontend/data-access/admin';
import type { components } from '@rescue-frontend/data-access/openapi';

import {
  analyzeSpace,
  toSpaceListRow,
  toUnloadedSpaceRow,
  type SpaceAnalysis,
  type SpaceListRow,
  type SpaceTicket,
} from './space-analysis';
import type { SpaceHouseholdTarget } from './household-input';
import { readSpaceTickets } from './space-partial';

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

/** A space on the board. `tickets` is null until they're in, and its row then says so. */
export interface BoardSpace {
  building: AdminBuildingMapFieldsFragment;
  tickets: SpaceTicket[] | null;
  row: SpaceListRow;
}

/**
 * Every space with its tickets, ready to list. The tickets query doesn't return buildings, and a
 * building carries no status, so each space's tickets are loaded to work its row out. That is one
 * request a space; coming back to the window doesn't send them all again. A ticket or space write
 * still refreshes the spaces it can move (`spaceTicketKeysForWrite`, `buildingMapWriteKeys`), and
 * others' changes show on the board's next load. A space whose tickets are still coming, or failed
 * to, is listed without a state or counts (`toUnloadedSpaceRow`); `retry` asks again for whatever
 * failed.
 */
export function useSpaces(bounds?: BoundsInput) {
  const buildings = useBuildingMaps(bounds ? { bounds } : {});
  const items = buildings.data?.buildingMaps.items ?? NO_BUILDINGS;
  // Combined outside the render, so the result keeps its identity until a query's does change:
  // spreading each query's data into the memo's deps changed their count with the spaces.
  const tickets = useQueries({
    queries: items.map((building) => ({
      ...buildingMapTicketsQuery({ buildingMapUuid: building.uuid }),
      refetchOnWindowFocus: false,
      staleTime: SPACE_TICKETS_STALE_MS,
    })),
    combine: combineSpaceTickets,
  });

  const spaces = items.map((building, index): BoardSpace => {
    const loaded = tickets.data[index]?.buildingMapTickets;
    if (loaded) return loadedSpace(building, loaded);
    const load = tickets.errors[index] ? 'failed' : 'loading';
    return {
      building,
      tickets: null,
      row: toUnloadedSpaceRow(building, load),
    };
  });

  return {
    spaces,
    /** The list stopped at its limit: there are spaces past it. */
    moreSpaces: buildings.data?.buildingMaps.pageInfo.hasNextPage ?? false,
    isLoading: buildings.isPending || tickets.isPending,
    error: buildings.error ?? tickets.error,
    retrying: buildings.isFetching || tickets.isFetching,
    retry: () => {
      if (buildings.error) void buildings.refetch();
      tickets.refetchFailed();
    },
  };
}

const NO_BUILDINGS: AdminBuildingMapFieldsFragment[] = [];

/** How long a space's tickets stand on the board before a remount loads them again. */
const SPACE_TICKETS_STALE_MS = 5 * 60_000;

function combineSpaceTickets<T>(
  results: {
    data: T | undefined;
    isPending: boolean;
    isFetching: boolean;
    error: Error | null;
    refetch: () => Promise<unknown>;
  }[],
) {
  return {
    data: results.map((query) => query.data),
    errors: results.map((query) => query.error),
    isPending: results.some((query) => query.isPending),
    isFetching: results.some((query) => query.isFetching),
    error: results.find((query) => query.error)?.error ?? null,
    refetchFailed: () => {
      for (const query of results) if (query.error) void query.refetch();
    },
  };
}

/**
 * One space for the floor view. `building` is null while it loads, when it failed, and once it's
 * gone (`isLoading`, `error` tell which). Its tickets are read apart: `space` waits for them, and
 * `tickets` says whether they are in, on their way, failed, or read earlier with the latest read
 * failed (`readSpaceTickets`).
 */
export function useSpace(uuid: string | null) {
  const building = useBuildingMap({ uuid: uuid ?? '' });
  const ticketsQuery = useQuery({
    ...buildingMapTicketsQuery({ buildingMapUuid: uuid ?? '' }),
    enabled: Boolean(uuid),
    // The floor view says a failed read itself (讀不到… 重試); a toast too would stack one more
    // on every failed 重試.
    meta: { [SILENT_ERROR_META]: true },
  });
  const found = building.data?.buildingMap ?? null;
  const tickets = readSpaceTickets({
    data: ticketsQuery.data?.buildingMapTickets,
    error: ticketsQuery.error,
  });

  return {
    building: found,
    space:
      found && (tickets.state === 'loaded' || tickets.state === 'stale')
        ? loadedSpace(found, tickets.tickets)
        : null,
    tickets: tickets.state,
    retryingTickets: ticketsQuery.isFetching,
    retryTickets: () => void ticketsQuery.refetch(),
    isLoading: building.isPending,
    error: building.error ?? null,
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
  const target = found
    ? {
        uuid: found.uuid,
        name: found.name,
        floorLabels: found.floors.map((floor) => floor.label),
      }
    : (null satisfies SpaceHouseholdTarget | null);
  // A disabled query stays pending: only a ticket in a space waits for one.
  return { target, loading: Boolean(buildingMapUuid) && building.isPending };
}
