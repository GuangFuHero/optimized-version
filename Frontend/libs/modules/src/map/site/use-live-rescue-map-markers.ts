'use client';

import {
  GetStationsDocument,
  GetTicketDocument,
  GetTicketsWithNeedsDocument,
  PageInfoFieldsFragmentDoc,
  TicketNeedFieldsFragmentDoc,
  createUrqlClient,
  useFragment,
} from '@rescue-frontend/data-access';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchExchange, type CombinedError } from 'urql';
import { useDebounceValue } from 'usehooks-ts';

import type { RescueMapMarkerItem } from '../types';
import type { SiteRouteState } from '../../route/types';
import { sessionExpiryFetch } from '../../session/end-expired-session';
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

const IMPERATIVE_QUERY_CONTEXT = {
  requestPolicy: 'network-only' as const,
  suspense: false,
};

const LIST_PAGE_SIZE = 100;

// The header's search box writes every keystroke to the URL; ask the backend once typing pauses.
const SEARCH_SETTLE_MS = 300;

export function usePaginatedRescueMapMarkers(state?: SiteRouteState) {
  const client = useMemo(
    () =>
      createUrqlClient({
        runtime: 'client',
        url: '/api/graphql',
        exchanges: [fetchExchange],
        fetch: sessionExpiryFetch,
        requestPolicy: 'network-only',
        suspense: false,
      }),
    [],
  );
  const [dismissedMarkerIds, setDismissedMarkerIds] = useState<string[]>([]);
  const [sourceMarkers, setSourceMarkers] = useState<readonly RescueMapMarkerItem[]>(
    [],
  );
  const [isFetching, setIsFetching] = useState(false);
  // Until the first page is in, an empty list says nothing about what exists.
  const [hasFetchedOnce, setHasFetchedOnce] = useState(false);
  const [error, setError] = useState<CombinedError | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [pageIds, setPageIds] = useState<readonly string[]>([]);
  const activeDataType = state?.dataType ?? 'station';
  const ticketStatus = resolveTicketStatusQueryValue(state?.subDataTypes);
  const ticketSearch = resolveTicketSearch(state?.search);
  const [settledQuery] = useDebounceValue(
    ticketSearch.kind === 'query' ? ticketSearch.q : undefined,
    SEARCH_SETTLE_MS,
  );
  // Tickets only: stations are still filtered on the page, so a search must not reload them.
  const ticketQuery = activeDataType === 'ticket' ? settledQuery : undefined;
  const requestIdRef = useRef(0);

  const loadPage = useCallback(
    async (skip: number, append: boolean) => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setIsFetching(true);

      if (activeDataType === 'station') {
        const result = await client
          .query(GetStationsDocument, {
            bounds: undefined,
            skip,
            limit: LIST_PAGE_SIZE,
          }, IMPERATIVE_QUERY_CONTEXT)
          .toPromise();

        if (requestId !== requestIdRef.current) {
          return;
        }

        setIsFetching(false);
        setHasFetchedOnce(true);

        if (result.error) {
          setError(result.error);
          return;
        }

        setError(null);

        const nextItems = dedupeMarkersById(
          (result.data?.stations.items ?? [])
            .map((station) => mapStationToMarker(station))
            .filter((marker): marker is RescueMapMarkerItem => Boolean(marker)),
        );
        const pageInfo = result.data?.stations.pageInfo
          ? useFragment(PageInfoFieldsFragmentDoc, result.data.stations.pageInfo)
          : null;

        setSourceMarkers((current) =>
          append ? dedupeMarkersById([...current, ...nextItems]) : nextItems,
        );
        setHasNextPage(pageInfo?.hasNextPage ?? false);
        setLoadedCount(skip + nextItems.length);
        setPageIds(nextItems.map(({ id }) => id));
        return;
      }

      const result = await client
        .query(
          GetTicketsWithNeedsDocument,
          ticketPageVariables({
            status: ticketStatus,
            q: ticketQuery,
            skip,
            limit: LIST_PAGE_SIZE,
          }),
          IMPERATIVE_QUERY_CONTEXT,
        )
        .toPromise();

      if (requestId !== requestIdRef.current) {
        return;
      }

      setIsFetching(false);
      setHasFetchedOnce(true);

      if (result.error) {
        setError(result.error);
        return;
      }

      setError(null);

      const items = result.data?.tickets.items ?? [];
      const nextItems = dedupeMarkersById(
        items
          .map((ticket): RescueMapMarkerItem | null => {
            const marker = mapTicketToMarker(ticket);

            return marker && {
              ...marker,
              needs: ticket.tasks.map((task) =>
                useFragment(TicketNeedFieldsFragmentDoc, task),
              ),
            };
          })
          .filter((marker): marker is RescueMapMarkerItem => Boolean(marker)),
      );

      setSourceMarkers((current) =>
        append ? dedupeMarkersById([...current, ...nextItems]) : nextItems,
      );
      setHasNextPage(result.data?.tickets.pageInfo.hasNextPage ?? false);
      // As the backend counts them, placed or not: the next page goes back from where this one ended.
      setLoadedCount(skip + items.length);
      setPageIds(nextItems.map(({ id }) => id));
    },
    [activeDataType, client, ticketQuery, ticketStatus],
  );

  useEffect(() => {
    setSourceMarkers([]);
    setError(null);
    setHasNextPage(false);
    setLoadedCount(0);
    setPageIds([]);
    setDismissedMarkerIds([]);
    void loadPage(0, false);
  }, [loadPage]);

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

      const needs = ticket.tasks.map((task) =>
        useFragment(TicketNeedFieldsFragmentDoc, task),
      );

      setSourceMarkers((current) =>
        dedupeMarkersById([{ ...marker, needs }, ...current]),
      );
    });
  }, [activeDataType, ticketQuery, ticketStatus]);

  const markers = useMemo(() => {
    const dismissedIdSet = new Set(dismissedMarkerIds);

    return sourceMarkers.filter((marker) => !dismissedIdSet.has(marker.id));
  }, [dismissedMarkerIds, sourceMarkers]);

  const dismissMarker = useCallback((markerId: string) => {
    setDismissedMarkerIds((current) =>
      current.includes(markerId) ? current : [...current, markerId],
    );
  }, []);

  const loadNextPage = useCallback(() => {
    if (isFetching || !hasNextPage) {
      return;
    }

    // Tickets move in the list's order between two pages; the next goes back over a few of them.
    void loadPage(
      activeDataType === 'ticket'
        ? nextTicketPageSkip(loadedCount)
        : loadedCount,
      true,
    );
  }, [activeDataType, hasNextPage, isFetching, loadPage, loadedCount]);

  /**
   * Swap in one ticket as it stands after a claim, a release or a stop — its needs and its status,
   * on the row's badge — so its row agrees with the detail drawer without reloading every page of
   * the list. A ticket found gone (null — deleted) leaves the list.
   */
  const replaceTicket = useCallback(
    (ticketUuid: string, reloaded: ReloadedTicket | null) => {
      if (!reloaded) {
        dismissMarker(ticketUuid);
        return;
      }

      const { needs, ticketStatus } = reloaded;

      setSourceMarkers((current) =>
        current.map((marker) => {
          if (marker.id !== ticketUuid) {
            return marker;
          }

          const withNeeds = { ...marker, needs };

          return ticketStatus ? withTicketStatus(withNeeds, ticketStatus) : withNeeds;
        }),
      );
    },
    [dismissMarker],
  );

  /**
   * One ticket as a marker, fetched on its own — for a link to a ticket that none of the loaded
   * pages holds. Only its drawer shows it, and the drawer reads the needs itself, so the marker
   * carries none (a copy here would go stale after a claim). Null when the ticket is gone or has
   * no point to place.
   */
  const loadTicketMarker = useCallback(
    async (uuid: string): Promise<RescueMapMarkerItem | null> => {
      const result = await client
        .query(GetTicketDocument, { uuid }, IMPERATIVE_QUERY_CONTEXT)
        .toPromise();
      const ticket = result.data?.ticket;

      return ticket ? mapTicketToMarker(ticket) : null;
    },
    [client],
  );

  return {
    markers,
    /** The `q` the loaded tickets were searched with, once typing settled; undefined for none. */
    ticketQuery,
    error,
    isFetching,
    hasFetchedOnce,
    dismissMarker,
    hasNextPage,
    loadNextPage,
    /** The ids the newest page brought, so the list can tell whether any of them is listed. */
    pageIds,
    loadTicketMarker,
    replaceTicket,
  };
}
