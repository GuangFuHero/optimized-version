'use client';

import {
  GetStationsDocument,
  GetTicketsWithNeedsDocument,
} from '@rescue-frontend/data-access';
import {
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { useDebounceValue } from 'usehooks-ts';

import type { RescueMapMarkerItem } from '../types';
import type { SiteRouteState } from '../../route/types';
import { siteGraphql, SITE_READ_OPTIONS } from '../../session/site-clients';
import type { ReloadedTicket } from '../../ticket/needs/use-ticket-needs';
import { resolveTicketStatusQueryValue } from '../../ticket/status';
import { onTicketCreated } from '../../ticket/ticket-changes';
import { resolveTicketSearch } from '../../ticket/ticket-search';
import {
  dedupeMarkersById,
  mapStationToMarker,
  mapTicketToMarker,
  withTicketStatus,
} from './markers';
import { nextTicketPageSkip, ticketPageVariables } from './ticket-pages';

const LIST_PAGE_SIZE = 100;

// The header's search box writes every keystroke to the URL; ask the backend once typing pauses.
const SEARCH_SETTLE_MS = 300;

interface MarkerPage {
  markers: RescueMapMarkerItem[];
  /** How far the page went, for where the next one starts. */
  read: number;
  hasNextPage: boolean;
}

type MarkerPages = InfiniteData<MarkerPage, number>;

function placedMarkers(markers: readonly (RescueMapMarkerItem | null)[]) {
  return dedupeMarkersById(
    markers.filter((marker): marker is RescueMapMarkerItem => Boolean(marker)),
  );
}

/** Each page's markers, `edit`ed. */
function editPages(
  pages: MarkerPages | undefined,
  edit: (markers: RescueMapMarkerItem[]) => RescueMapMarkerItem[],
) {
  return (
    pages && {
      ...pages,
      pages: pages.pages.map((page) => ({
        ...page,
        markers: edit(page.markers),
      })),
    }
  );
}

export function usePaginatedRescueMapMarkers(state?: SiteRouteState) {
  const queryClient = useQueryClient();
  const activeDataType = state?.dataType ?? 'station';
  const ticketStatus = resolveTicketStatusQueryValue(state?.subDataTypes);
  const ticketSearch = resolveTicketSearch(state?.search);
  const [settledQuery] = useDebounceValue(
    ticketSearch.kind === 'query' ? ticketSearch.q : undefined,
    SEARCH_SETTLE_MS,
  );
  // Tickets only: stations are still filtered on the page, so a search must not reload them.
  const ticketQuery = activeDataType === 'ticket' ? settledQuery : undefined;
  const queryKey = [
    'site-list',
    'markers',
    activeDataType,
    { ticketStatus, ticketQuery },
  ] as const;

  const list = useInfiniteQuery({
    ...SITE_READ_OPTIONS,
    queryKey,
    initialPageParam: 0,
    queryFn: async ({ pageParam: skip, signal }): Promise<MarkerPage> => {
      if (activeDataType === 'station') {
        const { stations } = await siteGraphql(
          GetStationsDocument,
          { bounds: undefined, skip, limit: LIST_PAGE_SIZE },
          signal,
        );
        const markers = placedMarkers(stations.items.map(mapStationToMarker));

        return {
          markers,
          read: markers.length,
          hasNextPage: stations.pageInfo.hasNextPage,
        };
      }

      const { tickets } = await siteGraphql(
        GetTicketsWithNeedsDocument,
        ticketPageVariables({
          status: ticketStatus,
          q: ticketQuery,
          skip,
          limit: LIST_PAGE_SIZE,
        }),
        signal,
      );

      return {
        markers: placedMarkers(
          tickets.items.map((ticket) => {
            const marker = mapTicketToMarker(ticket);

            return marker && { ...marker, needs: ticket.tasks };
          }),
        ),
        // As the backend counts them, placed or not: the next page goes back from where this one ended.
        read: tickets.items.length,
        hasNextPage: tickets.pageInfo.hasNextPage,
      };
    },
    getNextPageParam: (last, _pages, skip) => {
      if (!last.hasNextPage) {
        return undefined;
      }

      // Tickets move in the list's order between two pages; the next goes back over a few of them.
      return activeDataType === 'ticket'
        ? nextTicketPageSkip(skip + last.read)
        : skip + last.read;
    },
  });

  // A ticket filed through 請求協助 is the newest there is, so it goes first; the list's sort then
  // puts it at the top of its tier, where the first page would. Not into stations, nor past a status
  // filter or a search: changing any of them reloads the list.
  useEffect(() => {
    if (activeDataType !== 'ticket' || ticketStatus || ticketQuery) {
      return;
    }

    return onTicketCreated((ticket) => {
      const marker = mapTicketToMarker(ticket);

      if (!marker) {
        return;
      }

      queryClient.setQueryData<MarkerPages>(
        queryKey,
        (pages) =>
          pages && {
            ...pages,
            pages: pages.pages.map((page, index) =>
              index === 0
                ? {
                    ...page,
                    markers: [
                      { ...marker, needs: ticket.tasks },
                      ...page.markers,
                    ],
                  }
                : page,
            ),
          },
      );
    });
  }, [activeDataType, queryClient, queryKey, ticketQuery, ticketStatus]);

  const pages = list.data?.pages;
  const markers = dedupeMarkersById(
    pages?.flatMap((page) => page.markers) ?? [],
  );
  // The ids the newest page brought, so the list can tell whether any of them is listed.
  const pageIds = pages?.at(-1)?.markers.map(({ id }) => id) ?? [];
  const { isFetching, hasNextPage, fetchNextPage } = list;

  const loadNextPage = useCallback(() => {
    if (isFetching || !hasNextPage) {
      return;
    }

    void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetching]);

  /**
   * Swap in one ticket as it stands after a claim, a release or a stop — its needs and its status,
   * on the row's badge — so its row agrees with the detail drawer without reloading every page of
   * the list. A ticket found gone (null — deleted) leaves the list.
   */
  const replaceTicket = useCallback(
    (ticketUuid: string, reloaded: ReloadedTicket | null) =>
      queryClient.setQueryData<MarkerPages>(queryKey, (current) =>
        editPages(current, (page) =>
          reloaded
            ? page.map((marker) => {
                if (marker.id !== ticketUuid) {
                  return marker;
                }

                const withNeeds = { ...marker, needs: reloaded.needs };

                return reloaded.ticketStatus
                  ? withTicketStatus(withNeeds, reloaded.ticketStatus)
                  : withNeeds;
              })
            : page.filter((marker) => marker.id !== ticketUuid),
        ),
      ),
    [queryClient, queryKey],
  );

  return {
    markers,
    /** The `q` the loaded tickets were searched with, once typing settled; undefined for none. */
    ticketQuery,
    error: list.error,
    isFetching,
    // Until the first page is in, an empty list says nothing about what exists.
    hasFetchedOnce: list.isFetched,
    hasNextPage,
    loadNextPage,
    pageIds,
    replaceTicket,
  };
}
