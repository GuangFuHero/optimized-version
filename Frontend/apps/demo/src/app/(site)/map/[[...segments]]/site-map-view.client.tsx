'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import ShareRoundedIcon from '@mui/icons-material/ShareRounded';
import { Box } from '@mui/material';

import {
  BuildingDrawer,
  createPointShareTarget,
  createTaskMatchTicketDetailOverrides,
  dedupeMarkersById,
  hasRescueMapDetailItem,
  Map,
  MapRequestHelpBar,
  NeedClaimProvider,
  PlaceHereAction,
  PointShareDrawer,
  shouldLookUpLinkedTicket,
  SITE_FALLBACK_DATA_TYPE,
  SiteMapControls,
  syncDocumentMetadata,
  useAuthSession,
  useCreatedTicketMarker,
  useLinkedTicketLookup,
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

  // A ticket made here stays on the map until the view fetches it too; from then on the fetched
  // one, being fresher, is the one shown. So does one opened from a building or a link, while open.
  const visibleMarkers = useMemo(
    () =>
      dedupeMarkersById([
        ...liveDataSnapshot.markers,
        ...[
          ...createdMarkers,
          ...(buildingTicketMarker ? [buildingTicketMarker] : []),
          ...(linkedTicketMarker ? [linkedTicketMarker] : []),
        ].filter((marker) => !goneTicketIds.includes(marker.id)),
      ]),
    [
      buildingTicketMarker,
      createdMarkers,
      goneTicketIds,
      linkedTicketMarker,
      liveDataSnapshot.markers,
    ],
  );

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

    // A guest's location cell is selectable too, and is not a marker of its own.
    if (hasRescueMapDetailItem(visibleMarkers, selectedId)) {
      seenSelectionRef.current = selectedId;
      return;
    }

    if (goneTicket?.id === selectedId) {
      return;
    }

    const letGo = () =>
      onReplaceRouteState({
        ...mergedRouteState,
        selectedMarkerId: undefined,
      });

    if (
      !shouldLookUpLinkedTicket({
        selectedId,
        dataType: baseRouteState.dataType ?? SITE_FALLBACK_DATA_TYPE,
        seenLoaded: seenSelectionRef.current === selectedId,
      })
    ) {
      letGo();
      return;
    }

    let cancelled = false;

    void lookUpLinkedTicket(selectedId).then((linked) => {
      if (cancelled) {
        return;
      }

      if (linked.kind === 'ticket') {
        setLinkedTicketMarker(linked.marker);
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
  // (null — deleted) loses its pin, and with it the selection, so its drawer shuts.
  const showReloadedTicketStatus = useCallback(
    (ticketUuid: string, reloaded: ReloadedTicket | null) => {
      if (!reloaded) {
        liveDataStore.dismissMarker(ticketUuid);
        setGoneTicketIds((current) =>
          current.includes(ticketUuid) ? current : [...current, ticketUuid],
        );
        return;
      }

      if (reloaded.ticketStatus) {
        liveDataStore.replaceTicketStatus(ticketUuid, reloaded.ticketStatus);
      }
    },
    [liveDataStore],
  );

  const renderControls = useCallback(
    (controller: RescueMapControllerValue) => (
      <SiteMapControls controller={controller} />
    ),
    [],
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
            goneTicket={goneTicket}
            viewMemoryKey="site"
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
