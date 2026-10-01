'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import EditNoteRoundedIcon from '@mui/icons-material/EditNoteRounded';
import PlaceRoundedIcon from '@mui/icons-material/PlaceRounded';
import ShareRoundedIcon from '@mui/icons-material/ShareRounded';
import { Box, ButtonBase, Fab, Stack, Typography, Zoom } from '@mui/material';
import { useSession } from 'next-auth/react';

import { designTokens } from '@rescue-frontend/ui';

import {
  createPointShareTarget,
  createTaskMatchTicketDetailOverrides,
  dedupeMarkersById,
  hasRescueMapDetailItem,
  Map,
  MapRequestHelpButton,
  NeedClaimProvider,
  PlaceHereAction,
  PointShareDrawer,
  SiteMapControls,
  SiteStationReportDrawer,
  StationCreateDrawer,
  StationReportHistoryPanel,
  syncDocumentMetadata,
  useCreatedTicketMarker,
  useSiteMapLiveData,
  useSiteMapLiveDataSnapshot,
  useSiteMapRouteState,
  useSiteMapViewportState,
  useSiteMapViewportStore,
  useStationReports,
  type PointShareTarget,
  type ReloadedTicket,
  type RescueMapControllerValue,
  type RescueMapDraftPoint,
  type RescueMapMarkerItem,
  type SiteRouteState,
} from '@rescue-frontend/modules';

const { color, primitives, shadow } = designTokens;

export function SiteMapView() {
  return <SiteMapViewContent />;
}

const DEFAULT_MAP_METADATA = {
  title: '救災地圖 - 島嶼守望',
  description: '檢視救災任務與站點資訊。',
};
const DEFAULT_CREATE_CENTER: [number, number] = [23.884, 121.0];

// 「＋」 adds stations only: a request for help is filed through 請求協助, from the shell (spec Q4).
const CREATE_ACCENT = {
  solid: color.brand.secondary.default,
  soft: color.bg.secondary.subtle,
  text: color.brand.secondary.subtle,
  border: color.brand.secondary.default,
  hover: primitives.color.blue[100],
};

function ControlChip({
  label,
  active,
  icon,
  toneSoft,
  toneText,
  toneBorder,
  toneHover,
  onClick,
}: {
  label: string;
  active?: boolean;
  icon: React.ReactNode;
  toneSoft?: string;
  toneText?: string;
  toneBorder?: string;
  toneHover?: string;
  onClick: () => void;
}) {
  return (
    <ButtonBase
      disableRipple
      onClick={onClick}
      sx={{
        height: 38,
        px: 1.5,
        borderRadius: '999px',
        border: `1px solid ${
          active ? (toneBorder ?? color.border.accent) : color.border.accent
        }`,
        bgcolor: active
          ? (toneSoft ?? color.bg.primary.subtle)
          : color.bg.neutral.default,
        color: active
          ? (toneText ?? color.brand.primary.subtle)
          : color.fg.neutral.default,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        '&:hover': {
          bgcolor: active
            ? (toneHover ?? toneSoft ?? color.bg.primary.subtle)
            : color.bg.neutral.subtle,
        },
      }}
    >
      <Box sx={{ display: 'grid', placeItems: 'center' }}>{icon}</Box>
      <Typography sx={{ fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' }}>
        {label}
      </Typography>
    </ButtonBase>
  );
}

function SiteMapCreateDock({
  active,
  onToggle,
  onCreateStation,
}: {
  active: boolean;
  onToggle: () => void;
  onCreateStation: () => void;
}) {
  const accent = CREATE_ACCENT;

  return (
    <Box
      sx={{
        position: 'absolute',
        right: 16,
        bottom: { mobile: 20, tablet: 24 },
        zIndex: 1200,
        pointerEvents: 'none',
      }}
    >
      <Stack
        direction="row"
        spacing={1.25}
        sx={{
          alignItems: 'center',
          pointerEvents: 'auto',
        }}
      >
        <Zoom in={active}>
          <Box>
            <ControlChip
              label="新增站點"
              active
              icon={<PlaceRoundedIcon sx={{ fontSize: 18 }} />}
              toneSoft={accent.soft}
              toneText={accent.text}
              toneBorder={accent.border}
              toneHover={accent.hover}
              onClick={onCreateStation}
            />
          </Box>
        </Zoom>
        <Fab
          size="medium"
          onClick={onToggle}
          sx={{
            width: 48,
            height: 48,
            minHeight: 48,
            bgcolor: active ? accent.soft : color.bg.neutral.default,
            color: active ? accent.text : color.fg.neutral.default,
            border: `1px solid ${active ? accent.border : color.border.accent}`,
            boxShadow: shadow.lg,
            pointerEvents: 'auto',
            '&:hover': {
              bgcolor: active ? accent.hover : color.bg.primary.subtle,
            },
          }}
        >
          {active ? (
            <CloseRoundedIcon sx={{ fontSize: 20 }} />
          ) : (
            <AddRoundedIcon sx={{ fontSize: 22 }} />
          )}
        </Fab>
      </Stack>
    </Box>
  );
}

function SiteMapCenterPin({ open }: { open: boolean }) {
  const accent = CREATE_ACCENT;

  return (
    <Box
      sx={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -100%)',
        zIndex: 1190,
        pointerEvents: 'none',
      }}
    >
      <Zoom in={open}>
        <Stack sx={{ alignItems: 'center' }} spacing={0.25}>
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: '999px',
              bgcolor: accent.solid,
              border: `2px solid ${color.bg.neutral.default}`,
              boxShadow: shadow.lg,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <PlaceRoundedIcon
              sx={{ fontSize: 20, color: color.fg.onSecondary }}
            />
          </Box>
          <Box
            sx={{
              width: 14,
              height: 14,
              mt: '-8px',
              bgcolor: accent.solid,
              transform: 'rotate(45deg)',
              borderBottom: `2px solid ${color.bg.neutral.default}`,
              borderRight: `2px solid ${color.bg.neutral.default}`,
              boxShadow: shadow.md,
            }}
          />
        </Stack>
      </Zoom>
    </Box>
  );
}

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
  createModeActive,
  reportsByStationId,
  onMapRouteStateChange,
  onToggleCreateMode,
  onOpenCreateStation,
  onOpenReport,
  onOpenShareTarget,
  onReplaceRouteState,
}: {
  baseRouteState: SiteRouteState;
  createdMarkers: readonly RescueMapMarkerItem[];
  createModeActive: boolean;
  reportsByStationId: ReturnType<
    typeof useStationReports
  >['reportsByStationId'];
  onMapRouteStateChange: (next: SiteRouteState) => void;
  onToggleCreateMode: () => void;
  onOpenCreateStation: () => void;
  onOpenReport: (marker: RescueMapMarkerItem) => void;
  onOpenShareTarget: (target: PointShareTarget) => void;
  onReplaceRouteState: (next: SiteRouteState) => void;
}) {
  const { status: authStatus } = useSession();
  const viewportState = useSiteMapViewportState();
  const viewportStore = useSiteMapViewportStore();
  const liveDataStore = useSiteMapLiveData(baseRouteState);
  const liveDataSnapshot = useSiteMapLiveDataSnapshot(liveDataStore);
  const isAuthenticated = authStatus === 'authenticated';
  const mergedRouteState = useMemo<SiteRouteState>(
    () => mergeRouteStateWithViewport(baseRouteState, viewportState),
    [baseRouteState, viewportState],
  );
  // A blank spot tapped on the map, for 請求協助 there (spec S3). Not while 「＋」 is open: its pin
  // in the middle is then the point being placed, and a second one would confuse the two.
  const [draftPoint, setDraftPoint] = useState<RescueMapDraftPoint | null>(
    null,
  );
  const selectedMarkerId = baseRouteState.selectedMarkerId;

  const handleMapClick = useCallback(
    ([lat, lng]: [number, number]) => {
      if (!createModeActive) {
        setDraftPoint({ lat, lng });
      }
    },
    [createModeActive],
  );

  // Let go once a pin or cell is opened — left standing, it would read as belonging to it — and
  // once 「＋」 opens.
  useEffect(() => {
    if (selectedMarkerId || createModeActive) {
      setDraftPoint(null);
    }
  }, [createModeActive, selectedMarkerId]);

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

  // Tickets found gone since — deleted (B's S7). The live data drops them itself; one made here is
  // dropped here, or it would stand in for the fetched one it was waiting for.
  const [goneTicketIds, setGoneTicketIds] = useState<readonly string[]>([]);

  // A ticket made here stays on the map until the view fetches it too; from then on the fetched
  // one, being fresher, is the one shown.
  const visibleMarkers = useMemo(
    () =>
      dedupeMarkersById([
        ...liveDataSnapshot.markers,
        ...createdMarkers.filter(
          (marker) => !goneTicketIds.includes(marker.id),
        ),
      ]),
    [createdMarkers, goneTicketIds, liveDataSnapshot.markers],
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
    if (!baseRouteState.selectedMarkerId) {
      return;
    }

    if (!liveDataSnapshot.hasFetchedOnce || liveDataSnapshot.isFetching) {
      return;
    }

    // A guest's location cell is selectable too, and is not a marker of its own.
    const hasSelectedMarker = hasRescueMapDetailItem(
      visibleMarkers,
      baseRouteState.selectedMarkerId,
    );

    if (hasSelectedMarker) {
      return;
    }

    onReplaceRouteState({
      ...mergedRouteState,
      selectedMarkerId: undefined,
    });
  }, [
    baseRouteState.selectedMarkerId,
    liveDataSnapshot.hasFetchedOnce,
    liveDataSnapshot.isFetching,
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
      }),
    [createCurrentPointShareTarget, isAuthenticated, onOpenShareTarget],
  );

  // A claim, a release or a stop can change a ticket's status, which its pin shows; the next fetch
  // would bring it, but the person who did it should not have to wait for one. A ticket found gone
  // (null — deleted, B's S7) loses its pin, and with it the selection, so its drawer shuts.
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
      <>
        <SiteMapControls controller={controller} />
        <SiteMapCenterPin open={createModeActive} />
        {/* A phone's 請求協助 (spec S2); set aside while 「＋」 is open, whose 新增站點 reaches
            the middle of a 390px screen. */}
        {createModeActive ? null : <MapRequestHelpButton />}
        {isAuthenticated ? (
          <SiteMapCreateDock
            active={createModeActive}
            onToggle={onToggleCreateMode}
            onCreateStation={onOpenCreateStation}
          />
        ) : null}
      </>
    ),
    [
      createModeActive,
      isAuthenticated,
      onOpenCreateStation,
      onToggleCreateMode,
    ],
  );

  const stationDetailAction = useCallback(
    (marker: RescueMapMarkerItem) => ({
      label: '建議修改',
      icon: <EditNoteRoundedIcon />,
      onClick: () => onOpenReport(marker),
    }),
    [onOpenReport],
  );

  const stationDetailSecondaryAction = useCallback(
    (marker: RescueMapMarkerItem) => ({
      label: '分享',
      icon: <ShareRoundedIcon />,
      onClick: () => onOpenShareTarget(createCurrentPointShareTarget(marker)),
    }),
    [createCurrentPointShareTarget, onOpenShareTarget],
  );

  const stationPendingCorrectionCount = useCallback(
    (marker: RescueMapMarkerItem) => reportsByStationId[marker.id]?.length ?? 0,
    [reportsByStationId],
  );

  const stationDetailTabPanels = useCallback(
    (marker: RescueMapMarkerItem) => ({
      pendingCorrections: (
        <StationReportHistoryPanel
          reports={reportsByStationId[marker.id] ?? []}
        />
      ),
    }),
    [reportsByStationId],
  );

  return (
    // The drawer's claim buttons claim through this. The map keeps no copy of the needs (its popups
    // offer no claiming), only each ticket's status.
    <NeedClaimProvider onTicketReloaded={showReloadedTicketStatus}>
      <Map
        markers={visibleMarkers}
        closureAreas={liveDataSnapshot.closureAreas}
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
        stationDetailAction={stationDetailAction}
        stationDetailSecondaryAction={stationDetailSecondaryAction}
        stationPendingCorrectionCount={stationPendingCorrectionCount}
        stationDetailTabPanels={stationDetailTabPanels}
      />
    </NeedClaimProvider>
  );
}

function SiteMapScene({
  createdMarkers,
  createModeActive,
  reportsByStationId,
  onToggleCreateMode,
  onOpenCreateStation,
  onOpenReport,
  onOpenShareTarget,
}: {
  createdMarkers: readonly RescueMapMarkerItem[];
  createModeActive: boolean;
  reportsByStationId: ReturnType<
    typeof useStationReports
  >['reportsByStationId'];
  onToggleCreateMode: () => void;
  onOpenCreateStation: () => void;
  onOpenReport: (marker: RescueMapMarkerItem) => void;
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
      createModeActive={createModeActive}
      reportsByStationId={reportsByStationId}
      onMapRouteStateChange={handleMapRouteStateChange}
      onToggleCreateMode={onToggleCreateMode}
      onOpenCreateStation={onOpenCreateStation}
      onOpenReport={onOpenReport}
      onOpenShareTarget={onOpenShareTarget}
      onReplaceRouteState={mapRoute.replace}
    />
  );
}

function SiteMapCreatePanels({
  stationDrawerOpen,
  onCloseStationDrawer,
  onCreatedMarker,
}: {
  stationDrawerOpen: boolean;
  onCloseStationDrawer: () => void;
  onCreatedMarker: (marker: RescueMapMarkerItem) => void;
}) {
  const viewportState = useSiteMapViewportState();
  const viewportStore = useSiteMapViewportStore();
  const currentDraftPosition =
    viewportState.position?.center ?? DEFAULT_CREATE_CENTER;

  const handleDraftLocationChange = useCallback(
    (position: [number, number]) => {
      const snapshot = viewportStore.getSnapshot();

      viewportStore.setState({
        ...snapshot,
        position: { ...snapshot.position, center: position },
      });
    },
    [viewportStore],
  );

  return (
    <StationCreateDrawer
      open={stationDrawerOpen}
      onClose={onCloseStationDrawer}
      initialPosition={currentDraftPosition}
      onCreatedMarker={onCreatedMarker}
      onLocationChange={handleDraftLocationChange}
    />
  );
}

function SiteMapViewContent() {
  const mapRoute = useSiteMapRouteState();
  const { reportsByStationId, submitStationReport } = useStationReports();
  const [createdMarkers, setCreatedMarkers] = useState<
    readonly RescueMapMarkerItem[]
  >([]);
  const [createModeActive, setCreateModeActive] = useState(false);
  const [stationDrawerOpen, setStationDrawerOpen] = useState(false);
  const [reportStation, setReportStation] =
    useState<RescueMapMarkerItem | null>(null);
  const [shareTarget, setShareTarget] = useState<PointShareTarget | null>(null);

  // Filed through 請求協助, which lives in the site shell: it turns the page to the ticket in the
  // same render, so the ticket has to be among the markers by then.
  useCreatedTicketMarker((marker) => {
    setCreatedMarkers((current) => [marker, ...current]);
  });

  const resetCreateFlow = () => {
    setCreateModeActive(false);
  };

  const openCreateStation = () => {
    setCreateModeActive(true);
    setStationDrawerOpen(true);
  };

  const closeReportDrawer = () => {
    setReportStation(null);
  };

  return (
    <>
      <SiteMapScene
        createdMarkers={createdMarkers}
        createModeActive={createModeActive}
        reportsByStationId={reportsByStationId}
        onToggleCreateMode={() =>
          setCreateModeActive((current) => {
            if (current) {
              setStationDrawerOpen(false);
            }

            return !current;
          })
        }
        onOpenCreateStation={openCreateStation}
        onOpenReport={setReportStation}
        onOpenShareTarget={setShareTarget}
      />
      <SiteStationReportDrawer
        open={Boolean(reportStation)}
        station={reportStation}
        reports={reportStation ? reportsByStationId[reportStation.id] : []}
        onClose={closeReportDrawer}
        onSubmit={(values) => {
          if (!reportStation) {
            return;
          }

          submitStationReport(reportStation, values);
          closeReportDrawer();
        }}
      />
      <SiteMapCreatePanels
        stationDrawerOpen={stationDrawerOpen}
        onCloseStationDrawer={() => {
          setStationDrawerOpen(false);
          resetCreateFlow();
        }}
        onCreatedMarker={(marker) => {
          setCreatedMarkers((current) => [marker, ...current]);
          setStationDrawerOpen(false);
          resetCreateFlow();
          // Made from tickets too (「＋」 is there on both), where a station does not show and would
          // look lost: turn to stations, with no filter to hide it, and open it (spec S2).
          mapRoute.replace({
            ...mapRoute.state,
            dataType: 'station',
            subDataTypes: undefined,
            search: undefined,
            selectedMarkerId: marker.id,
          });
        }}
      />
      <PointShareDrawer
        open={Boolean(shareTarget)}
        target={shareTarget}
        onClose={() => setShareTarget(null)}
      />
    </>
  );
}
