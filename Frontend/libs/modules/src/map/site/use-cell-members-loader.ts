'use client';

import { GetCellTicketsDocument } from '@rescue-frontend/data-access';
import { useCallback, useMemo, useRef } from 'react';

import { LOCATION_CELL_MEMBERS_PAGE_SIZE } from '../location-cells';
import type { LocationCellMembersLoader, RescueMapMarkerItem } from '../types';
import { mapTicketToMarker } from './markers';
import { createSiteMapClient, SITE_MAP_QUERY_CONTEXT } from './site-map-client';
import { ticketCellStatuses } from './ticket-cells';

/**
 * Reads a counted cell's tickets as it is opened (`tickets(locationCell:)`), under the map's status
 * filter, so the list holds what the cell's count counted. Each page read is also handed to
 * `onLoaded`: picking a ticket in the list selects it by id, and the map finds it among its markers.
 */
export function useCellMembersLoader(
  subDataTypes: readonly string[] | undefined,
  onLoaded: (members: readonly RescueMapMarkerItem[]) => void,
): LocationCellMembersLoader {
  const client = useMemo(() => createSiteMapClient(), []);
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;
  // By value: a new array with the same statuses is the same filter, and keeps an open list as it is.
  const statusesKey = (ticketCellStatuses(subDataTypes) ?? []).join(',');

  return useCallback(
    async (cell: string, skip: number) => {
      const result = await client
        .query(
          GetCellTicketsDocument,
          {
            locationCell: cell,
            statuses: ticketCellStatuses(
              statusesKey ? statusesKey.split(',') : [],
            ),
            skip,
            limit: LOCATION_CELL_MEMBERS_PAGE_SIZE,
          },
          SITE_MAP_QUERY_CONTEXT,
        )
        .toPromise();
      const page = result.data?.tickets;

      if (!page) {
        throw result.error ?? new Error('No tickets came back for the cell');
      }

      const members = page.items
        .map((ticket) => mapTicketToMarker(ticket))
        .filter((marker): marker is RescueMapMarkerItem => Boolean(marker));

      onLoadedRef.current(members);

      return { members, hasMore: page.pageInfo.hasNextPage };
    },
    [client, statusesKey],
  );
}
