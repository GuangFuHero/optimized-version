'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import {
  GetBuildingMapWithTicketsDocument,
  type GetBuildingMapWithTicketsQuery,
} from '@rescue-frontend/data-access';

import { mapTicketToMarker } from '../map/site/markers';
import { siteGraphqlQuery } from '../session/site-clients';
import { formatTicketStreet } from '../ticket/address';
import { onTicketReread } from '../ticket/ticket-changes';
import type { BuildingFloor } from './floors';
import type { BuildingTicket } from './summary';

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
    needs: ref.tasks,
  };
}

/**
 * A building map and every ticket filed inside it (`GetBuildingMapWithTickets`), for its drawer and for
 * 上一張／下一張 in a ticket's detail — one request between them. Read again when a
 * ticket of it is (`onTicketReread`): after a claim, say, its shortfall and its place in the order move.
 * A guest gets the building and no tickets; `building` is null for one deleted since. `mayHoldMore`
 * when it came back with as many as were asked for: older ones may be left out.
 */
export function useBuilding(uuid: string | null | undefined) {
  const { data, isFetching, error, refetch } = useQuery({
    ...siteGraphqlQuery(GetBuildingMapWithTicketsDocument, {
      uuid: uuid ?? '',
      limit: BUILDING_TICKET_LIMIT,
    }),
    enabled: Boolean(uuid),
  });

  const building = ((): BuildingMap | null => {
    const map = data?.buildingMap;

    return map
      ? {
          uuid: map.uuid,
          name: map.name,
          address: formatTicketStreet(map.secondaryLocation),
          floors: map.floors,
        }
      : null;
  })();

  const tickets = (data?.buildingMapTickets ?? [])
    .map(readBuildingTicket)
    .filter((ticket): ticket is BuildingTicket => ticket !== null);

  useEffect(
    () =>
      onTicketReread((ticketUuid) => {
        if (tickets.some((ticket) => ticket.marker.id === ticketUuid)) {
          void refetch();
        }
      }),
    [refetch, tickets],
  );

  const mayHoldMore =
    (data?.buildingMapTickets.length ?? 0) >= BUILDING_TICKET_LIMIT;

  return {
    building,
    tickets,
    mayHoldMore,
    fetching: isFetching,
    error,
    hasData: Boolean(data),
  };
}
