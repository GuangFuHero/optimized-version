'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import ShareRoundedIcon from '@mui/icons-material/ShareRounded';
import { Box } from '@mui/material';

import {
  BuildingDrawer,
  createPointShareTarget,
  createTaskMatchTicketDetailOverrides,
  dedupeMarkersById,
  floorHelpForOpenBuilding,
  hasRescueMapDetailItem,
  Map,
  MapCellsNotice,
  MapRequestHelpBar,
  NeedClaimProvider,
  pinnedBesideBuildings,
  PlaceHereAction,
  PointShareDrawer,
  readLinkedSelection,
  SITE_FALLBACK_DATA_TYPE,
  SiteMapControls,
  syncDocumentMetadata,
  useAuthSession,
  useCellMembersLoader,
  useCreatedTicketMarker,
  useLinkedTicketLookup,
  useSiteMapBuildings,
  useSiteMapLiveData,
  useSiteMapLiveDataSnapshot,
  useSiteMapRouteState,
  useSiteMapViewportState,
  useSiteMapViewportStore,
  type PointShareTarget,
  type ReloadedTicket,
  type RescueMapControllerValue,
  type RescueMapDraftPoint,
  type RescueMapGoneTicket,
  type RescueMapMarkerItem,
  type SiteRouteState,
} from '@rescue-frontend/modules';

export function SiteMapView() {
  return <SiteMapViewContent />;
}

const DEFAULT_MAP_METADATA = {
  title: '救災地圖 - 島嶼守望',
  description: '檢視救災任務與站點資訊。',
};

function getSubDataTypesSignature(state: SiteRouteState): string {
  return (state.subDataTypes ?? []).join(',');
}

function haveSameNonViewportState(
  current: SiteRouteState,
  next: SiteRouteState,
): boolean {
  return (
    current.baseLayer === next.baseLayer &&
    current.dataType === next.dataType &&
    current.search === next.search &&
    current.selectedMarkerId === next.selectedMarkerId &&
    getSubDataTypesSignature(current) === getSubDataTypesSignature(next)
  );
}

function mergeRouteStateWithViewport(
  state: SiteRouteState,
  viewportState: ReturnType<typeof useSiteMapViewportState>,
): SiteRouteState {
  return {
    ...state,
    position: viewportState.position ?? state.position,
    bbox: viewportState.bbox ?? state.bbox,
  };
}

function SiteMapViewportDataLayer({
  baseRouteState,
  createdMarkers,
  onMapRouteStateChange,
  onOpenShareTarget,
  onReplaceRouteState,
}: {
  baseRouteState: SiteRouteState;
  createdMarkers: readonly RescueMapMarkerItem[];
  onMapRouteStateChange: (next: SiteRouteState) => void;
  onOpenShareTarget: (target: PointShareTarget) => void;
  onReplaceRouteState: (next: SiteRouteState) => void;
}) {
  const { status: authStatus } = useAuthSession();
  const viewportState = useSiteMapViewportState();
  const viewportStore = useSiteMapViewportStore();
  const liveDataStore = useSiteMapLiveData(baseRouteState);
  const liveDataSnapshot = useSiteMapLiveDataSnapshot(liveDataStore);
  const isAuthenticated = authStatus === 'authenticated';
  const mergedRouteState = useMemo<SiteRouteState>(
    () => mergeRouteStateWithViewport(baseRouteState, viewportState),
    [baseRouteState, viewportState],
  );
  // A blank spot tapped on the map, for 請求協助 there.
  const [draftPoint, setDraftPoint] = useState<RescueMapDraftPoint | null>(
    null,
  );
  const selectedMarkerId = baseRouteState.selectedMarkerId;

  const handleMapClick = useCallback(([lat, lng]: [number, number]) => {
    setDraftPoint({ lat, lng });
  }, []);

  // Let go once a pin or cell is opened: left standing, it would read as belonging to it.
  useEffect(() => {
    if (selectedMarkerId) {
      setDraftPoint(null);
    }
  }, [selectedMarkerId]);

  useEffect(() => {
    if (!draftPoint) {
      return;
    }

    const letGoOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDraftPoint(null);
      }
    };

    window.addEventListener('keydown', letGoOnEscape);
    return () => window.removeEventListener('keydown', letGoOnEscape);
  }, [draftPoint]);

  const draftPointAction = useMemo(
    () =>
      draftPoint ? (
        <PlaceHereAction
          point={draftPoint}
          onPlaced={() => setDraftPoint(null)}
        />
      ) : null,
    [draftPoint],
  );

  // Tickets found gone since — deleted. The live data drops them itself; one made here is
  // dropped here, or it would stand in for the fetched one it was waiting for.
  const [goneTicketIds, setGoneTicketIds] = useState<readonly string[]>([]);

  // The tickets listed in an opened cell, which come one cell at a time rather than with the
  // view: picking one selects it by id, so the map has to hold it. A cell's tickets are not drawn
  // as pins; the cell stands for them.
  const [cellMembers, setCellMembers] = useState<
    readonly RescueMapMarkerItem[]
  >([]);
  const keepCellMembers = useCallback(
    (members: readonly RescueMapMarkerItem[]) =>
      setCellMembers((current) => dedupeMarkersById([...members, ...current])),
    [],
  );
  const loadCellMembers = useCellMembersLoader(
    baseRouteState.subDataTypes,
    keepCellMembers,
  );

  // 現場分區: the building a ticket's 看各樓層 opened, and the last of its tickets opened from it —
  // from its drawer or 上一張／下一張 — which the view may not have fetched (past its pages).
  const [buildingUuid, setBuildingUuid] = useState<string | null>(null);
  const [buildingTicketMarker, setBuildingTicketMarker] =
    useState<RescueMapMarkerItem | null>(null);

  // A link to a ticket the view never fetched — past its 200, outside it, left out by a filter, or
  // not there at all — asks the backend (ADR-444): the ticket, or why there is none.
  const lookUpLinkedTicket = useLinkedTicketLookup();
  const [linkedTicketMarker, setLinkedTicketMarker] =
    useState<RescueMapMarkerItem | null>(null);
  const [goneTicket, setGoneTicket] = useState<RescueMapGoneTicket | null>(
    null,
  );
  // The last selection seen in the view. One that drops out of it afterwards was panned or filtered
  // away, not deleted, and is let go without asking.
  const seenSelectionRef = useRef<string | undefined>(undefined);

  // Let go once another ticket is opened, or none — judged when the selection moves, not when the
  // ticket is set: the selection follows it a render later.
  useEffect(() => {
    const letGo = <T extends { id: string }>(current: T | null) =>
      current && current.id !== selectedMarkerId ? null : current;

    setBuildingTicketMarker(letGo);
    setLinkedTicketMarker(letGo);
    setGoneTicket(letGo);
  }, [selectedMarkerId]);

  // The open buildings, on the map of tickets only.
  const buildings = useSiteMapBuildings(
    (baseRouteState.dataType ?? SITE_FALLBACK_DATA_TYPE) === 'ticket',
  );

  // A ticket made here stays on the map until the view fetches it too; from then on the fetched
  // one, being fresher, is the one shown. So does one opened from a building or a link, while open,
  // and one read with its cell. A building's tickets are its entry's to show, but for the one open.
  const visibleMarkers = useMemo(
    () => [
      ...pinnedBesideBuildings(
        dedupeMarkersById([
          ...liveDataSnapshot.markers,
          ...[
            ...createdMarkers,
            ...(buildingTicketMarker ? [buildingTicketMarker] : []),
            ...(linkedTicketMarker ? [linkedTicketMarker] : []),
            ...cellMembers,
          ].filter((marker) => !goneTicketIds.includes(marker.id)),
        ]),
        buildings.drawn,
        selectedMarkerId,
      ),
      ...buildings.markers,
    ],
    [
      buildingTicketMarker,
      buildings,
      cellMembers,
      createdMarkers,
      goneTicketIds,
      linkedTicketMarker,
      liveDataSnapshot.markers,
      selectedMarkerId,
    ],
  );

  // 在這一層請求協助 in the drawer of a building the map knows the point of.
  const requestHelpOnFloor = floorHelpForOpenBuilding(
    buildings.entries,
    buildingUuid,
    () => setBuildingUuid(null),
  );

  // Opened from a building or a link, a ticket opens even when the map's status filter leaves its
  // pin out: the map is handed it as its linked item, and shows it as long as it is selected.
  const linkedItem =
    [buildingTicketMarker, linkedTicketMarker, goneTicket].find(
      (item) => item && item.id === selectedMarkerId,
    ) ?? null;

  // The viewport read when pressed, as for a share: kept in the callback, every pan would make a new one.
  const openBuildingTicket = useCallback(
    (marker: RescueMapMarkerItem) => {
      setBuildingTicketMarker(marker);
      onMapRouteStateChange({
        ...mergeRouteStateWithViewport(
          baseRouteState,
          viewportStore.getSnapshot(),
        ),
        selectedMarkerId: marker.id,
      });
    },
    [baseRouteState, onMapRouteStateChange, viewportStore],
  );

  const createCurrentPointShareTarget = useCallback(
    (marker: RescueMapMarkerItem) =>
      createPointShareTarget({
        marker,
        module: 'map',
        state: mergeRouteStateWithViewport(
          baseRouteState,
          viewportStore.getSnapshot(),
        ),
        origin: window.location.origin,
      }),
    [baseRouteState, viewportStore],
  );

  const metadataTarget = useMemo(() => {
    const selectedMarker = visibleMarkers.find(
      (marker) => marker.id === baseRouteState.selectedMarkerId,
    );

    if (!selectedMarker || typeof window === 'undefined') {
      return null;
    }

    return createCurrentPointShareTarget(selectedMarker);
  }, [
    baseRouteState.selectedMarkerId,
    createCurrentPointShareTarget,
    visibleMarkers,
  ]);

  useEffect(() => {
    syncDocumentMetadata(metadataTarget, DEFAULT_MAP_METADATA);
  }, [metadataTarget]);

  useEffect(() => {
    const selectedId = baseRouteState.selectedMarkerId;

    if (!selectedId) {
      return;
    }

    if (!liveDataSnapshot.hasFetchedOnce || liveDataSnapshot.isFetching) {
      return;
    }

    // A guest's location cell is selectable too, and is not a marker of its own; one the backend
    // counted may have none of its tickets in the page.
    if (
      hasRescueMapDetailItem(visibleMarkers, selectedId, liveDataSnapshot.cells)
    ) {
      seenSelectionRef.current = selectedId;
      return;
    }

    if (goneTicket?.id === selectedId) {
      return;
    }

    // `?id=` replaced, not pushed: going back skips the link as it was.
    const select = (uuid: string | undefined) =>
      onReplaceRouteState({
        ...mergedRouteState,
        selectedMarkerId: uuid,
      });
    const letGo = () => select(undefined);

    const linkedSelection = readLinkedSelection({
      selectedId,
      dataType: baseRouteState.dataType ?? SITE_FALLBACK_DATA_TYPE,
      seenLoaded: seenSelectionRef.current === selectedId,
    });

    if (linkedSelection.kind === 'let-go') {
      letGo();
      return;
    }

    if (linkedSelection.kind === 'replace') {
      select(linkedSelection.uuid);
      return;
    }

    if (linkedSelection.kind === 'gone') {
      setGoneTicket(linkedSelection.ticket);
      return;
    }

    let cancelled = false;

    void lookUpLinkedTicket(selectedId).then((linked) => {
      if (cancelled) {
        return;
      }

      if (linked.kind === 'ticket') {
        setLinkedTicketMarker(linked.marker);
      } else if (linked.kind === 'replace') {
        select(linked.uuid);
      } else if (linked.kind === 'gone') {
        setGoneTicket(linked.ticket);
      } else {
        letGo();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    baseRouteState.dataType,
    baseRouteState.selectedMarkerId,
    goneTicket,
    liveDataSnapshot.cells,
    liveDataSnapshot.hasFetchedOnce,
    liveDataSnapshot.isFetching,
    lookUpLinkedTicket,
    mergedRouteState,
    onReplaceRouteState,
    visibleMarkers,
  ]);

  const createTicketDetailOverrides = useCallback(
    (marker: RescueMapMarkerItem) =>
      createTaskMatchTicketDetailOverrides({
        marker,
        isAuthenticated,
        onShare: () => onOpenShareTarget(createCurrentPointShareTarget(marker)),
        onOpenBuilding: setBuildingUuid,
        onSelectTicket: openBuildingTicket,
      }),
    [
      createCurrentPointShareTarget,
      isAuthenticated,
      onOpenShareTarget,
      openBuildingTicket,
    ],
  );

  // A claim, a release or a stop can change a ticket's status, which its pin shows; the next fetch
  // would bring it, but the person who did it should not have to wait for one. A ticket found gone
  // (null — deleted) loses its pin, and its copy if a building or a link opened it, and with them
  // the selection, so its drawer shuts.
  const showReloadedTicketStatus = useCallback(
    (ticketUuid: string, reloaded: ReloadedTicket | null) => {
      if (!reloaded) {
        const dropGone = (current: RescueMapMarkerItem | null) =>
          current?.id === ticketUuid ? null : current;

        liveDataStore.dismissMarker(ticketUuid);
        setGoneTicketIds((current) =>
          current.includes(ticketUuid) ? current : [...current, ticketUuid],
        );
        setBuildingTicketMarker(dropGone);
        setLinkedTicketMarker(dropGone);
        return;
      }

      if (reloaded.ticketStatus) {
        liveDataStore.replaceTicketStatus(ticketUuid, reloaded.ticketStatus);
      }
    },
    [liveDataStore],
  );

  // Drawn with the controls, inside the map's own column: centred on the map, and clear of a detail
  // panel open beside it, where the panel's list ends in 再顯示 200 筆 or 再試一次.
  const cellsNotice = liveDataSnapshot.cellsNotice;
  const renderControls = useCallback(
    (controller: RescueMapControllerValue) => (
      <>
        <SiteMapControls controller={controller} />
        {cellsNotice ? <MapCellsNotice notice={cellsNotice} /> : null}
      </>
    ),
    [cellsNotice],
  );

  const stationDetailSecondaryAction = useCallback(
    (marker: RescueMapMarkerItem) => ({
      label: '分享',
      icon: <ShareRoundedIcon />,
      onClick: () => onOpenShareTarget(createCurrentPointShareTarget(marker)),
    }),
    [createCurrentPointShareTarget, onOpenShareTarget],
  );

  return (
    // The drawer's claim buttons claim through this. The map keeps no copy of the needs (its popups
    // offer no claiming), only each ticket's status.
    <NeedClaimProvider onTicketReloaded={showReloadedTicketStatus}>
      {/* A phone's 請求協助 takes a row under the map; the map keeps the rest. */}
      <Box
        sx={{
          height: '100%',
          display: 'grid',
          gridTemplateRows: 'minmax(0, 1fr) auto',
        }}
      >
        <Box sx={{ minHeight: 0 }}>
          <Map
            markers={visibleMarkers}
            locationCells={liveDataSnapshot.cells}
            loadLocationCellMembers={loadCellMembers}
            closureAreas={liveDataSnapshot.closureAreas}
            publicZones={liveDataSnapshot.publicZones}
            routeState={baseRouteState}
            onRouteStateChange={onMapRouteStateChange}
            showScale
            viewportStore={viewportStore}
            isAuthenticated={isAuthenticated}
            renderControls={renderControls}
            onMapClick={handleMapClick}
            draftPoint={draftPoint}
            onDraftPointChange={setDraftPoint}
            draftPointAction={draftPointAction}
            ticketDetailOverrides={createTicketDetailOverrides}
            stationDetailSecondaryAction={stationDetailSecondaryAction}
            stationLayout="site"
            linkedItem={linkedItem}
            viewMemoryKey="site"
            onOpenBuilding={setBuildingUuid}
          />
        </Box>
        <MapRequestHelpBar />
      </Box>
      <BuildingDrawer
        buildingUuid={buildingUuid}
        isAuthenticated={isAuthenticated}
        onClose={() => setBuildingUuid(null)}
        onOpenTicket={(marker) => {
          setBuildingUuid(null);
          openBuildingTicket(marker);
        }}
        onRequestHelpOnFloor={requestHelpOnFloor}
      />
    </NeedClaimProvider>
  );
}

function SiteMapScene({
  createdMarkers,
  onOpenShareTarget,
}: {
  createdMarkers: readonly RescueMapMarkerItem[];
  onOpenShareTarget: (target: PointShareTarget) => void;
}) {
  const mapRoute = useSiteMapRouteState();

  const handleMapRouteStateChange = useCallback(
    (next: SiteRouteState) => {
      if (haveSameNonViewportState(mapRoute.state, next)) {
        mapRoute.replaceUrl(next);
        return;
      }

      mapRoute.replace(next);
    },
    [mapRoute],
  );

  return (
    <SiteMapViewportDataLayer
      baseRouteState={mapRoute.state}
      createdMarkers={createdMarkers}
      onMapRouteStateChange={handleMapRouteStateChange}
      onOpenShareTarget={onOpenShareTarget}
      onReplaceRouteState={mapRoute.replace}
    />
  );
}

function SiteMapViewContent() {
  const [createdMarkers, setCreatedMarkers] = useState<
    readonly RescueMapMarkerItem[]
  >([]);
  const [shareTarget, setShareTarget] = useState<PointShareTarget | null>(null);

  // Filed through 請求協助, which lives in the site shell: it turns the page to the ticket in the
  // same render, so the ticket has to be among the markers by then.
  useCreatedTicketMarker((marker) => {
    setCreatedMarkers((current) => [marker, ...current]);
  });

  return (
    <>
      <SiteMapScene
        createdMarkers={createdMarkers}
        onOpenShareTarget={setShareTarget}
      />
      <PointShareDrawer
        open={Boolean(shareTarget)}
        target={shareTarget}
        onClose={() => setShareTarget(null)}
      />
    </>
  );
}
