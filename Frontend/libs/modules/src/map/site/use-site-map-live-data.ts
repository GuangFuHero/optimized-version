'use client';

import {
  GetMapAreasDocument,
  GetStationsDocument,
  GetTicketCellsDocument,
  GetTicketsDocument,
  type GetStationsQuery,
  type GetTicketsQuery,
} from '@rescue-frontend/data-access';
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { CombinedError } from 'urql';

import type {
  RescueMapClosureArea,
  RescueMapLocationCell,
  RescueMapMarkerItem,
  RescueMapPublicZone,
} from '../types';
import type { SiteRouteState } from '../../route/types';
import { fetchAllAreaPages } from './area-pages';
import {
  areaOverlaysSignature,
  dedupeMarkersById,
  mapAreasToOverlays,
  mapStationToMarker,
  mapTicketToMarker,
  toBoundsInput,
  withTicketStatus,
} from './markers';
import {
  createSiteMapClient,
  SITE_MAP_QUERY_CONTEXT as LIVE_QUERY_CONTEXT,
} from './site-map-client';
import {
  readTicketCells,
  ticketCellStatuses,
  type TicketCellsNotice,
  type TicketCellsRead,
} from './ticket-cells';
import { useSiteMapViewportStore } from './use-site-map-viewport-state';

const EMPTY_LIVE_DATA_SNAPSHOT: SiteMapLiveDataSnapshot = {
  markers: [],
  cells: [],
  cellsNotice: null,
  closureAreas: [],
  publicZones: [],
  isFetching: false,
  error: null,
  hasFetchedOnce: false,
};

export interface SiteMapLiveDataSnapshot {
  markers: readonly RescueMapMarkerItem[];
  /**
   * The cells a viewer shown tickets as cells sees, as the backend counts them (`ticketCells`,
   * ADR-387): all of them, where `markers` holds a page. Empty for stations.
   */
  cells: readonly RescueMapLocationCell[];
  /** Why the counts could not be read, kept until a read works. */
  cellsNotice: TicketCellsNotice | null;
  closureAreas: readonly RescueMapClosureArea[];
  publicZones: readonly RescueMapPublicZone[];
  isFetching: boolean;
  error: CombinedError | null;
  hasFetchedOnce: boolean;
}

export interface SiteMapLiveDataStore {
  clearDismissedMarkers: () => void;
  dismissMarker: (markerId: string) => void;
  getSnapshot: () => SiteMapLiveDataSnapshot;
  replaceData: (next: SiteMapLiveDataSnapshot) => void;
  /** A ticket's status read again after a change on it, shown until the next fetch. */
  replaceTicketStatus: (ticketUuid: string, status: string) => void;
  setFetching: (isFetching: boolean) => void;
  subscribe: (listener: () => void) => () => void;
}

function markersSignature(markers: readonly RescueMapMarkerItem[]) {
  return markers
    .map(
      (marker) =>
        `${marker.id}:${marker.detailType}:${marker.variant}:${marker.position[0]}:${marker.position[1]}:${marker.label}:${marker.locationCell ?? ''}`,
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

function cellsSignature(
  cells: readonly RescueMapLocationCell[],
  notice: TicketCellsNotice | null,
) {
  return `${cells.map((cell) => `${cell.id}:${cell.count}:${cell.variant}`).join('|')}#${notice?.text ?? ''}`;
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
      .filter((marker): marker is RescueMapMarkerItem => Boolean(marker)),
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
  let currentCellsSignature = cellsSignature(
    initialState.cells,
    initialState.cellsNotice,
  );
  let currentAreaSignature = areaOverlaysSignature(initialState);
  let currentErrorSignature = initialState.error?.message ?? '';
  const dismissedMarkerIds = new Set<string>();
  const listeners = new Set<() => void>();

  const commit = (next: SiteMapLiveDataSnapshot) => {
    const filteredMarkers = next.markers.filter(
      (marker) => !dismissedMarkerIds.has(marker.id),
    );
    const nextMarkerSignature = markersSignature(filteredMarkers);
    const nextCellsSignature = cellsSignature(next.cells, next.cellsNotice);
    const nextAreaSignature = areaOverlaysSignature(next);
    const nextErrorSignature = next.error?.message ?? '';
    const unchanged =
      snapshot.isFetching === next.isFetching &&
      snapshot.hasFetchedOnce === next.hasFetchedOnce &&
      currentMarkerSignature === nextMarkerSignature &&
      currentCellsSignature === nextCellsSignature &&
      currentAreaSignature === nextAreaSignature &&
      currentErrorSignature === nextErrorSignature;

    if (unchanged) {
      return;
    }

    snapshot = {
      markers: filteredMarkers,
      // The same array while the cells are the same, so nothing downstream redraws them.
      cells:
        currentCellsSignature === nextCellsSignature
          ? snapshot.cells
          : next.cells,
      cellsNotice: next.cellsNotice,
      closureAreas: next.closureAreas,
      publicZones: next.publicZones,
      isFetching: next.isFetching,
      error: next.error,
      hasFetchedOnce: next.hasFetchedOnce,
    };
    currentMarkerSignature = nextMarkerSignature;
    currentCellsSignature = nextCellsSignature;
    currentAreaSignature = nextAreaSignature;
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
    // Through `commit`, whose signature carries each marker's label: a ticket not on the map, or
    // already showing this status, tells nobody.
    replaceTicketStatus: (ticketUuid, status) => {
      commit({
        ...snapshot,
        markers: snapshot.markers.map((marker) =>
          marker.id === ticketUuid && marker.detailType === 'ticket'
            ? withTicketStatus(marker, status)
            : marker,
        ),
      });
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
  const client = useMemo(() => createSiteMapClient(), []);

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
    // The counts last read in this run. They stay while the map is only panned or zoomed; a new run
    // is a new filter or layer, which they do not count, so it starts with none.
    let counted: TicketCellsRead = { cells: [], notice: null };

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
      // The same tickets for the pins and the cells' counts (468: left out means every status).
      const statuses =
        activeDataType === 'ticket'
          ? ticketCellStatuses(state.subDataTypes)
          : undefined;
      // Coarser cells as the map zooms out; the server caps how fine they get and ignores it
      // entirely for a viewer who may see exact points (ADR-283).
      const zoom = state.position?.zoom;

      if (!bounds) {
        store.replaceData({
          markers: [],
          cells: [],
          cellsNotice: null,
          closureAreas: [],
          publicZones: [],
          isFetching: false,
          error: null,
          hasFetchedOnce: store.getSnapshot().hasFetchedOnce,
        });
        return;
      }

      store.setFetching(true);

      // Every cell's count: a page of tickets holds 200, a cell can hold more (ADR-387). Asked with
      // the rest, but the pins and the areas go up without waiting for it: near the backend's time
      // limit it takes seconds.
      const cellsRequest =
        activeDataType === 'ticket'
          ? client
              .query(
                GetTicketCellsDocument,
                { bounds, statuses, zoom },
                LIVE_QUERY_CONTEXT,
              )
              .toPromise()
          : null;
      const [markerResult, areaResult] = await Promise.all([
        activeDataType === 'ticket'
          ? client
              .query(
                GetTicketsDocument,
                { bounds, statuses, skip: 0, limit: 200, zoom },
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
        fetchAllAreaPages((skip, limit) =>
          client
            .query(
              GetMapAreasDocument,
              { bounds, skip, limit },
              LIVE_QUERY_CONTEXT,
            )
            .toPromise(),
        ),
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
      const { closureAreas, publicZones } = mapAreasToOverlays(
        areaResult.items,
      );

      store.replaceData({
        markers,
        cells: cellsRequest ? counted.cells : [],
        cellsNotice: cellsRequest ? counted.notice : null,
        closureAreas,
        publicZones,
        // Still fetching while the counts are on their way, so a cell left open waits for them
        // before the map decides it is gone.
        isFetching: Boolean(cellsRequest),
        error: markerResult.error ?? areaResult.error ?? null,
        hasFetchedOnce: true,
      });

      if (!cellsRequest) {
        return;
      }

      const cellsResult = await cellsRequest;

      if (cancelled || nextRequestId !== requestId) {
        return;
      }

      // Refused (its time limit, zoomed far out) or failed: the cells this run last counted stay,
      // rather than an empty map that reads as no requests, and the notice says why.
      counted = readTicketCells(
        cellsResult.data?.ticketCells,
        cellsResult.error,
        counted.cells,
      );
      store.replaceData({
        ...store.getSnapshot(),
        cells: counted.cells,
        cellsNotice: counted.notice,
        isFetching: false,
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
