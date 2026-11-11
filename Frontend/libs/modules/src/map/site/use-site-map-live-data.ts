'use client';

import {
  GetMapAreasDocument,
  GetStationsDocument,
  GetTicketCellsDocument,
  GetTicketsDocument,
  type GraphqlError,
} from '@rescue-frontend/data-access';
import {
  keepPreviousData,
  skipToken,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import type {
  RescueMapClosureArea,
  RescueMapLocationCell,
  RescueMapMarkerItem,
  RescueMapPublicZone,
} from '../types';
import type { SiteRouteState } from '../../route/types';
import { siteGraphql, SITE_READ_OPTIONS } from '../../session/site-clients';
import { fetchAllAreaPages } from './area-pages';
import {
  dedupeMarkersById,
  mapAreasToOverlays,
  mapStationToMarker,
  mapTicketToMarker,
  toBoundsInput,
  withTicketStatus,
} from './markers';
import {
  readTicketCells,
  ticketCellStatuses,
  type TicketCellsNotice,
  type TicketCellsRead,
} from './ticket-cells';
import { useSiteMapViewportState } from './use-site-map-viewport-state';

export interface SiteMapLiveData {
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
  hasFetchedOnce: boolean;
  /** A ticket found gone: its pin goes, and stays gone. */
  dismissMarker: (markerId: string) => void;
  /** A ticket's status read again after a change on it, shown until the next fetch. */
  replaceTicketStatus: (ticketUuid: string, status: string) => void;
}

type SiteMapView = Pick<
  SiteMapLiveData,
  'markers' | 'closureAreas' | 'publicZones'
>;

const NO_VIEW: SiteMapView = { markers: [], closureAreas: [], publicZones: [] };
const NO_CELLS: TicketCellsRead = { cells: [], notice: null };

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

function placedMarkers(markers: readonly (RescueMapMarkerItem | null)[]) {
  return dedupeMarkersById(
    markers.filter((marker): marker is RescueMapMarkerItem => Boolean(marker)),
  );
}

/**
 * The pins, the areas and the cells' counts in the map's view, read again as the view moves or the
 * filter changes. The last view's stay up while the next is read.
 */
export function useSiteMapLiveData(
  baseRouteState: SiteRouteState,
): SiteMapLiveData {
  const queryClient = useQueryClient();
  const viewport = useSiteMapViewportState();
  const state: SiteRouteState = {
    ...baseRouteState,
    position: viewport.position ?? baseRouteState.position,
    bbox: viewport.bbox ?? baseRouteState.bbox,
  };
  const bounds = toBoundsInput(state);
  const dataType = state.dataType ?? 'station';
  const stationType = resolveStationTypeFilter(state);
  // The same tickets for the pins and the cells' counts (468: left out means every status).
  const statuses =
    dataType === 'ticket' ? ticketCellStatuses(state.subDataTypes) : undefined;
  // Coarser cells as the map zooms out; the server caps how fine they get and ignores it entirely
  // for a viewer who may see exact points (ADR-283).
  const zoom = state.position?.zoom;

  const view = useQuery({
    ...SITE_READ_OPTIONS,
    queryKey: [
      'site-map',
      'view',
      { bounds, dataType, stationType, statuses, zoom },
    ],
    queryFn: async ({ signal }): Promise<SiteMapView> => {
      // A failed read of the pins leaves the map without them, and the areas still go up.
      const [markers, areas] = await Promise.all([
        dataType === 'ticket'
          ? siteGraphql(
              GetTicketsDocument,
              { bounds, statuses, skip: 0, limit: 200, zoom },
              signal,
            ).then(
              ({ tickets }) =>
                placedMarkers(tickets.items.map(mapTicketToMarker)),
              () => [],
            )
          : siteGraphql(
              GetStationsDocument,
              { bounds, stationType, skip: 0, limit: 200 },
              signal,
            ).then(
              ({ stations }) =>
                placedMarkers(stations.items.map(mapStationToMarker)),
              () => [],
            ),
        fetchAllAreaPages((skip, limit) =>
          siteGraphql(GetMapAreasDocument, { bounds, skip, limit }, signal),
        ),
      ]);

      return { markers, ...mapAreasToOverlays(areas.items) };
    },
    enabled: Boolean(bounds),
    placeholderData: keepPreviousData,
  });

  // The counts on screen, for a read that fails to keep: they still count what the filter asks
  // for while the map is only panned or zoomed. Another filter starts with none.
  const cellsFilter = JSON.stringify([dataType, statuses ?? null]);
  // Every cell's count: a page of tickets holds 200, a cell can hold more (ADR-387). Asked beside
  // the rest, which goes up without waiting for it: near the backend's time limit it takes seconds.
  // Refused (its time limit, zoomed far out) or failed, the cells last counted stay, rather than an
  // empty map that reads as no requests, and the notice says why.
  const cellsQuery = useQuery({
    ...SITE_READ_OPTIONS,
    queryKey: ['site-map', 'cells', cellsFilter, { bounds, zoom }],
    queryFn:
      bounds && dataType === 'ticket'
        ? ({ signal }) => {
            const latest = queryClient
              .getQueryCache()
              .findAll({ queryKey: ['site-map', 'cells', cellsFilter] })
              .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt)
              .find((query) => query.state.data !== undefined);
            const kept = latest
              ? (queryClient.getQueryData<TicketCellsRead>(latest.queryKey)
                  ?.cells ?? [])
              : [];

            return siteGraphql(
              GetTicketCellsDocument,
              { bounds, statuses, zoom },
              signal,
            ).then(
              ({ ticketCells }) => readTicketCells(ticketCells, null, kept),
              (error: GraphqlError) => readTicketCells(null, error, kept),
            );
          }
        : skipToken,
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === cellsFilter ? previous : undefined,
  });
  const counted =
    bounds && dataType === 'ticket' ? (cellsQuery.data ?? NO_CELLS) : NO_CELLS;

  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const dismissMarker = useCallback(
    (markerId: string) =>
      setDismissed((current) =>
        current.has(markerId) ? current : new Set([...current, markerId]),
      ),
    [],
  );
  const replaceTicketStatus = useCallback(
    (ticketUuid: string, status: string) =>
      queryClient.setQueriesData<SiteMapView>(
        { queryKey: ['site-map', 'view'] },
        (data) =>
          data && {
            ...data,
            markers: data.markers.map((marker) =>
              marker.id === ticketUuid && marker.detailType === 'ticket'
                ? withTicketStatus(marker, status)
                : marker,
            ),
          },
      ),
    [queryClient],
  );

  const shown = bounds ? (view.data ?? NO_VIEW) : NO_VIEW;
  const markers =
    dismissed.size === 0
      ? shown.markers
      : shown.markers.filter((marker) => !dismissed.has(marker.id));

  return {
    markers,
    cells: counted.cells,
    cellsNotice: counted.notice,
    closureAreas: shown.closureAreas,
    publicZones: shown.publicZones,
    // Still fetching while the counts are on their way, so a cell left open waits for them before
    // the map decides it is gone.
    isFetching: view.isFetching || cellsQuery.isFetching,
    hasFetchedOnce: view.data !== undefined,
    dismissMarker,
    replaceTicketStatus,
  };
}
