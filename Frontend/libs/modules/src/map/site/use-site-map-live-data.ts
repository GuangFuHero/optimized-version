'use client';

import {
  GetClosureAreasDocument,
  GetStationsDocument,
  GetTicketsDocument,
  createUrqlClient,
  type GetClosureAreasQuery,
  type GetStationsQuery,
  type GetTicketsQuery,
} from '@rescue-frontend/data-access';
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { fetchExchange, type CombinedError } from 'urql';

import type {
  RescueMapClosureArea,
  RescueMapMarkerItem,
} from '../types';
import type { SiteRouteState } from '../../route/types';
import { resolveTicketStatusQueryValue } from '../../ticket/status';
import {
  closureAreasSignature,
  dedupeMarkersById,
  mapClosureAreaToOverlay,
  mapStationToMarker,
  mapTicketToMarker,
  toBoundsInput,
} from './markers';
import { useSiteMapViewportStore } from './use-site-map-viewport-state';

const EMPTY_LIVE_DATA_SNAPSHOT: SiteMapLiveDataSnapshot = {
  markers: [],
  closureAreas: [],
  isFetching: false,
  error: null,
  hasFetchedOnce: false,
};

const LIVE_QUERY_CONTEXT = {
  requestPolicy: 'network-only' as const,
  suspense: false,
};

export interface SiteMapLiveDataSnapshot {
  markers: readonly RescueMapMarkerItem[];
  closureAreas: readonly RescueMapClosureArea[];
  isFetching: boolean;
  error: CombinedError | null;
  hasFetchedOnce: boolean;
}

export interface SiteMapLiveDataStore {
  clearDismissedMarkers: () => void;
  dismissMarker: (markerId: string) => void;
  getSnapshot: () => SiteMapLiveDataSnapshot;
  replaceData: (next: SiteMapLiveDataSnapshot) => void;
  setFetching: (isFetching: boolean) => void;
  subscribe: (listener: () => void) => () => void;
}

function markersSignature(markers: readonly RescueMapMarkerItem[]) {
  return markers
    .map(
      (marker) =>
        `${marker.id}:${marker.detailType}:${marker.variant}:${marker.position[0]}:${marker.position[1]}:${marker.label}`,
    )
    .join('|');
}

function resolveStationTypeFilter(state: SiteRouteState): string | undefined {
  if (state.dataType !== 'station') {
    return undefined;
  }

  const selectedTypes = (state.subDataTypes ?? []).filter(Boolean);

  if (selectedTypes.length !== 1) {
    return undefined;
  }

  return selectedTypes[0];
}

function resolveTicketStatusFilter(state: SiteRouteState): string | undefined {
  if (state.dataType !== 'ticket') {
    return undefined;
  }

  return resolveTicketStatusQueryValue(state.subDataTypes);
}

function mapMarkersForDataType({
  dataType,
  stationItems,
  ticketItems,
}: {
  dataType: SiteRouteState['dataType'];
  stationItems: GetStationsQuery['stations']['items'];
  ticketItems: GetTicketsQuery['tickets']['items'];
}) {
  if (dataType === 'ticket') {
    return dedupeMarkersById(
      ticketItems
        .map((ticket) => mapTicketToMarker(ticket))
        .filter((marker): marker is RescueMapMarkerItem => Boolean(marker)),
    );
  }

  return dedupeMarkersById(
    stationItems
      .map((station) => mapStationToMarker(station))
      .filter((marker): marker is RescueMapMarkerItem => Boolean(marker))
      .sort(
        (left, right) =>
          (right.stationMeta?.priorityScore ?? 0) -
          (left.stationMeta?.priorityScore ?? 0),
      ),
  );
}

function emitStoreListeners(listeners: Set<() => void>) {
  listeners.forEach((listener) => listener());
}

export function createSiteMapLiveDataStore(
  initialState: SiteMapLiveDataSnapshot = EMPTY_LIVE_DATA_SNAPSHOT,
): SiteMapLiveDataStore {
  let snapshot = initialState;
  let currentMarkerSignature = markersSignature(initialState.markers);
  let currentClosureSignature = closureAreasSignature(
    initialState.closureAreas,
  );
  let currentErrorSignature = initialState.error?.message ?? '';
  const dismissedMarkerIds = new Set<string>();
  const listeners = new Set<() => void>();

  const commit = (next: SiteMapLiveDataSnapshot) => {
    const filteredMarkers = next.markers.filter(
      (marker) => !dismissedMarkerIds.has(marker.id),
    );
    const nextMarkerSignature = markersSignature(filteredMarkers);
    const nextClosureSignature = closureAreasSignature(next.closureAreas);
    const nextErrorSignature = next.error?.message ?? '';
    const unchanged =
      snapshot.isFetching === next.isFetching &&
      snapshot.hasFetchedOnce === next.hasFetchedOnce &&
      currentMarkerSignature === nextMarkerSignature &&
      currentClosureSignature === nextClosureSignature &&
      currentErrorSignature === nextErrorSignature;

    if (unchanged) {
      return;
    }

    snapshot = {
      markers: filteredMarkers,
      closureAreas: next.closureAreas,
      isFetching: next.isFetching,
      error: next.error,
      hasFetchedOnce: next.hasFetchedOnce,
    };
    currentMarkerSignature = nextMarkerSignature;
    currentClosureSignature = nextClosureSignature;
    currentErrorSignature = nextErrorSignature;
    emitStoreListeners(listeners);
  };

  return {
    clearDismissedMarkers: () => {
      dismissedMarkerIds.clear();
    },
    dismissMarker: (markerId) => {
      if (dismissedMarkerIds.has(markerId)) {
        return;
      }

      dismissedMarkerIds.add(markerId);
      commit(snapshot);
    },
    getSnapshot: () => snapshot,
    replaceData: (next) => {
      commit(next);
    },
    setFetching: (isFetching) => {
      commit({
        ...snapshot,
        isFetching,
      });
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function useSiteMapLiveData(baseRouteState: SiteRouteState) {
  const viewportStore = useSiteMapViewportStore();
  const storeRef = useRef<SiteMapLiveDataStore | null>(null);
  const subDataTypesSignature = (baseRouteState.subDataTypes ?? []).join('|');
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

  if (!storeRef.current) {
    storeRef.current = createSiteMapLiveDataStore();
  }

  useEffect(() => {
    const store = storeRef.current;

    if (!store) {
      return;
    }

    let cancelled = false;
    let requestId = 0;

    store.clearDismissedMarkers();

    const load = async () => {
      const nextRequestId = requestId + 1;
      requestId = nextRequestId;

      const viewportState = viewportStore.getSnapshot();
      const state: SiteRouteState = {
        ...baseRouteState,
        position: viewportState.position ?? baseRouteState.position,
        bbox: viewportState.bbox ?? baseRouteState.bbox,
      };
      const bounds = toBoundsInput(state);
      const activeDataType = state.dataType ?? 'station';
      const stationType = resolveStationTypeFilter(state);
      const ticketStatus = resolveTicketStatusFilter(state);

      if (!bounds) {
        store.replaceData({
          markers: [],
          closureAreas: [],
          isFetching: false,
          error: null,
          hasFetchedOnce: store.getSnapshot().hasFetchedOnce,
        });
        return;
      }

      store.setFetching(true);

      const [markerResult, closureResult] = await Promise.all([
        activeDataType === 'ticket'
          ? client
              .query(
                GetTicketsDocument,
                {
                  bounds,
                  status: ticketStatus,
                  skip: 0,
                  limit: 200,
                },
                LIVE_QUERY_CONTEXT,
              )
              .toPromise()
          : client
              .query(
                GetStationsDocument,
                {
                  bounds,
                  stationType,
                  skip: 0,
                  limit: 200,
                },
                LIVE_QUERY_CONTEXT,
              )
              .toPromise(),
        client
          .query(
            GetClosureAreasDocument,
            {
              bounds,
              skip: 0,
              limit: 100,
            },
            LIVE_QUERY_CONTEXT,
          )
          .toPromise(),
      ]);

      if (cancelled || nextRequestId !== requestId) {
        return;
      }

      const markers = mapMarkersForDataType({
        dataType: activeDataType,
        stationItems:
          activeDataType === 'ticket'
            ? []
            : ((markerResult.data as GetStationsQuery | undefined)?.stations
                .items ?? []),
        ticketItems:
          activeDataType === 'ticket'
            ? ((markerResult.data as GetTicketsQuery | undefined)?.tickets
                .items ?? [])
            : [],
      });
      const closureAreas = (
        (closureResult.data?.closureAreas.items ??
          []) as GetClosureAreasQuery['closureAreas']['items']
      )
        .map((item) => mapClosureAreaToOverlay(item))
        .filter((item): item is RescueMapClosureArea => Boolean(item));

      store.replaceData({
        markers,
        closureAreas,
        isFetching: false,
        error: markerResult.error ?? closureResult.error ?? null,
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
  }, [
    baseRouteState.baseLayer,
    baseRouteState.dataType,
    client,
    subDataTypesSignature,
    viewportStore,
  ]);

  return storeRef.current;
}

export function useSiteMapLiveDataSnapshot(
  store: SiteMapLiveDataStore,
): SiteMapLiveDataSnapshot {
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}
