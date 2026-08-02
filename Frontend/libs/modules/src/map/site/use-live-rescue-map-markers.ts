'use client';

import {
  GetStationsDocument,
  GetTicketsDocument,
  PageInfoFieldsFragmentDoc,
  createUrqlClient,
  useFragment,
} from '@rescue-frontend/data-access';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchExchange, type CombinedError } from 'urql';

import type { RescueMapMarkerItem } from '../types';
import type { SiteRouteState } from '../../route/types';
import { resolveTicketStatusQueryValue } from '../../ticket/status';
import {
  dedupeMarkersById,
  mapStationToMarker,
  mapTicketToMarker,
} from './markers';

const IMPERATIVE_QUERY_CONTEXT = {
  requestPolicy: 'network-only' as const,
  suspense: false,
};

const LIST_PAGE_SIZE = 100;

export function usePaginatedRescueMapMarkers(state?: SiteRouteState) {
  const client = useMemo(
    () =>
      createUrqlClient({
        runtime: 'client',
        url: '/api/graphql',
        exchanges: [fetchExchange],
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
  const [error, setError] = useState<CombinedError | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const activeDataType = state?.dataType ?? 'station';
  const ticketStatus = resolveTicketStatusQueryValue(state?.subDataTypes);
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

        if (result.error) {
          setError(result.error);
          return;
        }

        setError(null);

        const nextItems = dedupeMarkersById(
          (result.data?.stations.items ?? [])
            .map((station) => mapStationToMarker(station))
            .filter((marker): marker is RescueMapMarkerItem => Boolean(marker))
            .sort(
              (left, right) =>
                (right.stationMeta?.priorityScore ?? 0) -
                (left.stationMeta?.priorityScore ?? 0),
            ),
        );
        const pageInfo = result.data?.stations.pageInfo
          ? useFragment(PageInfoFieldsFragmentDoc, result.data.stations.pageInfo)
          : null;

        setSourceMarkers((current) =>
          append ? dedupeMarkersById([...current, ...nextItems]) : nextItems,
        );
        setHasNextPage(pageInfo?.hasNextPage ?? false);
        setLoadedCount(skip + nextItems.length);
        return;
      }

      const result = await client
        .query(GetTicketsDocument, {
          bounds: undefined,
          status: ticketStatus,
          skip,
          limit: LIST_PAGE_SIZE,
        }, IMPERATIVE_QUERY_CONTEXT)
        .toPromise();

      if (requestId !== requestIdRef.current) {
        return;
      }

      setIsFetching(false);

      if (result.error) {
        setError(result.error);
        return;
      }

      setError(null);

      const nextItems = dedupeMarkersById(
        (result.data?.tickets.items ?? [])
          .map((ticket) => mapTicketToMarker(ticket))
          .filter((marker): marker is RescueMapMarkerItem => Boolean(marker)),
      );

      setSourceMarkers((current) =>
        append ? dedupeMarkersById([...current, ...nextItems]) : nextItems,
      );
      setHasNextPage(result.data?.tickets.pageInfo.hasNextPage ?? false);
      setLoadedCount(skip + nextItems.length);
    },
    [activeDataType, client, ticketStatus],
  );

  useEffect(() => {
    setSourceMarkers([]);
    setError(null);
    setHasNextPage(false);
    setLoadedCount(0);
    setDismissedMarkerIds([]);
    void loadPage(0, false);
  }, [loadPage]);

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

    void loadPage(loadedCount, true);
  }, [hasNextPage, isFetching, loadPage, loadedCount]);

  return {
    markers,
    error,
    isFetching,
    dismissMarker,
    hasNextPage,
    loadNextPage,
  };
}
