'use client';

import {
  GetStationsDocument,
  GetTicketsDocument,
  createUrqlClient,
} from '@rescue-frontend/data-access';
import { useEffect, useMemo, useState } from 'react';
import { fetchExchange, type CombinedError } from 'urql';

import type { RescueMapMarkerItem } from '../types';
import { sessionExpiryFetch } from '../../session/end-expired-session';
import {
  dedupeMarkersById,
  mapStationToMarker,
  mapTicketToMarker,
  toBoundsInput,
} from '../site/markers';
import type { SiteMapViewportStore } from '../site/use-site-map-viewport-state';

const LIVE_QUERY_CONTEXT = {
  requestPolicy: 'network-only' as const,
  suspense: false,
};

const LIVE_QUERY_LIMIT = 200;

export interface AdminMapLiveMarkers {
  markers: readonly RescueMapMarkerItem[];
  isFetching: boolean;
  error: CombinedError | null;
  hasFetchedOnce: boolean;
}

const EMPTY_LIVE_MARKERS: AdminMapLiveMarkers = {
  markers: [],
  isFetching: false,
  error: null,
  hasFetchedOnce: false,
};

/**
 * Tickets and stations inside the map's view, both at once: unlike the public map, which shows one
 * kind at a time, 互助地圖 lays them side by side. Fetched again whenever the view moves.
 */
export function useAdminMapLiveMarkers(
  viewportStore: SiteMapViewportStore,
): AdminMapLiveMarkers {
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
  const [liveMarkers, setLiveMarkers] =
    useState<AdminMapLiveMarkers>(EMPTY_LIVE_MARKERS);

  useEffect(() => {
    let cancelled = false;
    let requestId = 0;

    const load = async () => {
      const nextRequestId = requestId + 1;
      requestId = nextRequestId;

      const viewportState = viewportStore.getSnapshot();
      const bounds = toBoundsInput(viewportState);

      // No view yet: the map reports one once it has laid itself out.
      if (!bounds) {
        return;
      }

      setLiveMarkers((current) => ({ ...current, isFetching: true }));

      const [ticketResult, stationResult] = await Promise.all([
        client
          .query(
            GetTicketsDocument,
            {
              bounds,
              skip: 0,
              limit: LIVE_QUERY_LIMIT,
              zoom: viewportState.position?.zoom,
            },
            LIVE_QUERY_CONTEXT,
          )
          .toPromise(),
        client
          .query(
            GetStationsDocument,
            {
              bounds,
              skip: 0,
              limit: LIVE_QUERY_LIMIT,
            },
            LIVE_QUERY_CONTEXT,
          )
          .toPromise(),
      ]);

      if (cancelled || nextRequestId !== requestId) {
        return;
      }

      const markers = dedupeMarkersById(
        [
          ...(ticketResult.data?.tickets.items ?? []).map((ticket) =>
            mapTicketToMarker(ticket),
          ),
          ...(stationResult.data?.stations.items ?? []).map((station) =>
            mapStationToMarker(station),
          ),
        ].filter((marker): marker is RescueMapMarkerItem => Boolean(marker)),
      );

      setLiveMarkers({
        markers,
        isFetching: false,
        error: ticketResult.error ?? stationResult.error ?? null,
        hasFetchedOnce: true,
      });
    };

    void load();
    const unsubscribe = viewportStore.subscribe(() => {
      void load();
    });

    return () => {
      cancelled = true;
      requestId += 1;
      unsubscribe();
    };
  }, [client, viewportStore]);

  return liveMarkers;
}
