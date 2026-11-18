'use client';

import { useEventCallback } from 'usehooks-ts';

import { GetCellTicketsDocument } from '@rescue-frontend/data-access';
import { infiniteQueryOptions } from '@tanstack/react-query';
import { useCallback } from 'react';

import { siteGraphql, SITE_READ_OPTIONS } from '../../session/site-clients';
import { LOCATION_CELL_MEMBERS_PAGE_SIZE } from '../location-cells';
import type {
  LocationCellMembersLoader,
  LocationCellMembersPage,
  RescueMapMarkerItem,
} from '../types';
import { mapTicketToMarker } from './markers';
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
  const reportLoaded = useEventCallback(onLoaded);
  // By value: a new array with the same statuses is the same filter, and keeps an open list as it is.
  const statusesKey = (ticketCellStatuses(subDataTypes) ?? []).join(',');

  return useCallback(
    (cell: string) =>
      infiniteQueryOptions({
        ...SITE_READ_OPTIONS,
        queryKey: ['site-map', 'cell-members', cell, statusesKey],
        // Read afresh at each opening, so the map holds every ticket the list shows (`onLoaded`).
        gcTime: 0,
        initialPageParam: 0,
        queryFn: async ({
          pageParam: skip,
          signal,
        }): Promise<LocationCellMembersPage> => {
          const { tickets: page } = await siteGraphql(
            GetCellTicketsDocument,
            {
              locationCell: cell,
              statuses: ticketCellStatuses(
                statusesKey ? statusesKey.split(',') : [],
              ),
              skip,
              limit: LOCATION_CELL_MEMBERS_PAGE_SIZE,
            },
            signal,
          );
          const members = page.items
            .map((ticket) => mapTicketToMarker(ticket))
            .filter((marker): marker is RescueMapMarkerItem => Boolean(marker));

          reportLoaded(members);

          return {
            members,
            read: page.items.length,
            hasMore: page.pageInfo.hasNextPage,
          };
        },
        // After every ticket read so far, listed or not.
        getNextPageParam: (last, _pages, skip) =>
          last.hasMore ? skip + last.read : undefined,
      }),
    [statusesKey, reportLoaded],
  );
}
