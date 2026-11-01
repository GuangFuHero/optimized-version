'use client';

import { useEffect, useMemo } from 'react';
import { useQuery } from 'urql';

import {
  GetBuildingMapWithTicketsDocument,
  TicketNeedFieldsFragmentDoc,
  useFragment,
  type GetBuildingMapWithTicketsQuery,
} from '@rescue-frontend/data-access';

import { mapTicketToMarker } from '../map/site/markers';
import { formatTicketStreet } from '../ticket/address';
import { onTicketReread } from '../ticket/ticket-changes';
import type { BuildingFloor } from './floors';
import type { BuildingTicket } from './summary';

// The drawer and a ticket's detail show their own loading line instead of suspending the page.
const BUILDING_QUERY_CONTEXT = { suspense: false } as const;

/** The most tickets a building's drawer lists: the newest, in one request, with no pages. */
export const BUILDING_TICKET_LIMIT = 200;

export interface BuildingMap {
  uuid: string;
  name: string;
  /** The street address, the drawer's subtitle; null when the building has none. */
  address: string | null;
  floors: readonly BuildingFloor[];
}

type BuildingTicketRef =
  GetBuildingMapWithTicketsQuery['buildingMapTickets'][number];

function readBuildingTicket(ref: BuildingTicketRef): BuildingTicket | null {
  // Null without a point, which a ticket filed in a building always has (the building's own).
  const marker = mapTicketToMarker(ref);

  if (!marker) {
    return null;
  }

  return {
    marker,
    floor: ref.secondaryLocation?.floor ?? null,
    room: ref.secondaryLocation?.room ?? null,
    needs: ref.tasks.map((task) =>
      useFragment(TicketNeedFieldsFragmentDoc, task),
    ),
  };
}

/**
 * A building map and every ticket filed inside it (`GetBuildingMapWithTickets`), for its drawer and for
 * 上一張／下一張 in a ticket's detail — one request between them, as urql shares it. Read again when a
 * ticket of it is (`onTicketReread`): after a claim, say, its shortfall and its place in the order move.
 * A guest gets the building and no tickets; `building` is null for one deleted since. `mayHoldMore`
 * when it came back with as many as were asked for: older ones may be left out.
 */
export function useBuilding(uuid: string | null | undefined) {
  const [{ data, fetching, error }, reexecute] = useQuery({
    query: GetBuildingMapWithTicketsDocument,
    variables: { uuid: uuid ?? '', limit: BUILDING_TICKET_LIMIT },
    pause: !uuid,
    requestPolicy: 'cache-and-network',
    context: BUILDING_QUERY_CONTEXT,
  });

  const building = useMemo<BuildingMap | null>(() => {
    const map = data?.buildingMap;

    return map
      ? {
          uuid: map.uuid,
          name: map.name,
          address: formatTicketStreet(map.secondaryLocation),
          floors: map.floors,
        }
      : null;
  }, [data?.buildingMap]);

  const tickets = useMemo(
    () =>
      (data?.buildingMapTickets ?? [])
        .map(readBuildingTicket)
        .filter((ticket): ticket is BuildingTicket => ticket !== null),
    [data?.buildingMapTickets],
  );

  useEffect(
    () =>
      onTicketReread((ticketUuid) => {
        if (tickets.some((ticket) => ticket.marker.id === ticketUuid)) {
          reexecute({ requestPolicy: 'network-only' });
        }
      }),
    [reexecute, tickets],
  );

  const mayHoldMore =
    (data?.buildingMapTickets.length ?? 0) >= BUILDING_TICKET_LIMIT;

  return {
    building,
    tickets,
    mayHoldMore,
    fetching,
    error,
    hasData: Boolean(data),
  };
}
