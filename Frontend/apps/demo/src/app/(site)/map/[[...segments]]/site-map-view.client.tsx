'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import AddRoundedIcon from '@mui/icons-material/AddRounded';
import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded';
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
  hasRescueMapDetailItem,
  Map,
  PointShareDrawer,
  SITE_FALLBACK_DATA_TYPE,
  SiteMapControls,
  SiteStationReportDrawer,
  StationCreateDrawer,
  StationReportHistoryPanel,
  TaskMatchDeleteConfirmDialog,
  TicketCreateDrawer,
  useSiteMapLiveData,
  useSiteMapLiveDataSnapshot,
  useSiteMapRouteState,
  useSiteMapViewportState,
  useSiteMapViewportStore,
  useStationReports,
  useTaskMatches,
  type PointShareTarget,
  type RescueMapControllerValue,
  type RescueMapDataType,
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

function getCreateAccent(dataType: RescueMapDataType) {
  if (dataType === 'ticket') {
    return {
      solid: color.bg.primary.default,
      soft: color.bg.primary.subtle,
      text: color.brand.primary.subtle,
      border: color.border.accent,
      hover: primitives.color.orange[100],
    };
  }

  return {
    solid: color.brand.secondary.default,
    soft: color.bg.secondary.subtle,
    text: color.brand.secondary.subtle,
    border: color.brand.secondary.default,
    hover: primitives.color.blue[100],
  };
}

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
  dataType,
  onToggle,
  onCreateStation,
  onCreateTicket,
}: {
  active: boolean;
  dataType: RescueMapDataType;
  onToggle: () => void;
  onCreateStation: () => void;
  onCreateTicket: () => void;
}) {
  const accent = getCreateAccent(dataType);

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
            {dataType === 'station' ? (
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
            ) : (
              <ControlChip
                label="新增任務"
                active
                icon={<AssignmentRoundedIcon sx={{ fontSize: 18 }} />}
                toneSoft={accent.soft}
                toneText={accent.text}
                toneBorder={accent.border}
                toneHover={accent.hover}
                onClick={onCreateTicket}
              />
            )}
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

function SiteMapCenterPin({
  open,
  dataType,
}: {
  open: boolean;
  dataType: RescueMapDataType;
}) {
  const accent = getCreateAccent(dataType);

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

function ensureHeadMeta(
  selector: string,
  attributes: Record<string, string>,
): HTMLMetaElement {
  let element = document.head.querySelector<HTMLMetaElement>(selector);

  if (!element) {
    element = document.createElement('meta');
    Object.entries(attributes).forEach(([name, value]) => {
      element?.setAttribute(name, value);
    });
    document.head.appendChild(element);
  }

  return element;
}

function syncDocumentMetadata(target: PointShareTarget | null) {
  const title = target?.title ?? DEFAULT_MAP_METADATA.title;
  const description = target?.description ?? DEFAULT_MAP_METADATA.description;
  const url = target?.url ?? window.location.href;

  document.title = title;
  ensureHeadMeta('meta[name="description"]', {
    name: 'description',
  }).setAttribute('content', description);
  ensureHeadMeta('meta[property="og:title"]', {
    property: 'og:title',
  }).setAttribute('content', title);
  ensureHeadMeta('meta[property="og:description"]', {
    property: 'og:description',
  }).setAttribute('content', description);
  ensureHeadMeta('meta[property="og:url"]', {
    property: 'og:url',
  }).setAttribute('content', url);
  ensureHeadMeta('meta[name="twitter:title"]', {
    name: 'twitter:title',
  }).setAttribute('content', title);
  ensureHeadMeta('meta[name="twitter:description"]', {
    name: 'twitter:description',
  }).setAttribute('content', description);
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
  onOpenCreateTicket,
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
  onOpenCreateTicket: () => void;
  onOpenReport: (marker: RescueMapMarkerItem) => void;
  onOpenShareTarget: (target: PointShareTarget) => void;
  onReplaceRouteState: (next: SiteRouteState) => void;
}) {
  const { data: session, status: authStatus } = useSession();
  const viewportState = useSiteMapViewportState();
  const viewportStore = useSiteMapViewportStore();
  const liveDataStore = useSiteMapLiveData(baseRouteState);
  const liveDataSnapshot = useSiteMapLiveDataSnapshot(liveDataStore);
  const { getTaskMatchState, claimTask, deleteMatchSheet } = useTaskMatches();
  const isAuthenticated = authStatus === 'authenticated';
  const currentUserId = session?.user?.id ?? null;
  const mergedRouteState = useMemo<SiteRouteState>(
    () => mergeRouteStateWithViewport(baseRouteState, viewportState),
    [baseRouteState, viewportState],
  );
  const [pendingDeleteTask, setPendingDeleteTask] =
    useState<RescueMapMarkerItem | null>(null);
  const visibleMarkers = useMemo(
    () => [...createdMarkers, ...liveDataSnapshot.markers],
    [createdMarkers, liveDataSnapshot.markers],
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
    syncDocumentMetadata(metadataTarget);
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
    (marker: RescueMapMarkerItem) => {
      const taskMatchState = getTaskMatchState(marker);
      const canDeleteMatchSheet =
        Boolean(currentUserId) &&
        marker.ticketMeta?.createdBy === currentUserId;

      return createTaskMatchTicketDetailOverrides({
        marker,
        state: taskMatchState,
        isAuthenticated,
        canDeleteMatchSheet,
        onClaimTask: () => claimTask(marker),
        onDeleteMatchSheet: () => setPendingDeleteTask(marker),
        onShare: () => onOpenShareTarget(createCurrentPointShareTarget(marker)),
      });
    },
    [
      claimTask,
      currentUserId,
      createCurrentPointShareTarget,
      getTaskMatchState,
      isAuthenticated,
      onOpenShareTarget,
    ],
  );

  const renderControls = useCallback(
    (controller: RescueMapControllerValue) => (
      <>
        <SiteMapControls controller={controller} />
        <SiteMapCenterPin
          open={createModeActive}
          dataType={controller.dataType ?? SITE_FALLBACK_DATA_TYPE}
        />
        {isAuthenticated ? (
          <SiteMapCreateDock
            active={createModeActive}
            dataType={controller.dataType ?? SITE_FALLBACK_DATA_TYPE}
            onToggle={onToggleCreateMode}
            onCreateStation={onOpenCreateStation}
            onCreateTicket={onOpenCreateTicket}
          />
        ) : null}
      </>
    ),
    [
      createModeActive,
      isAuthenticated,
      onOpenCreateStation,
      onOpenCreateTicket,
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
    <>
      <Map
        markers={visibleMarkers}
        closureAreas={liveDataSnapshot.closureAreas}
        routeState={baseRouteState}
        onRouteStateChange={onMapRouteStateChange}
        showScale
        viewportStore={viewportStore}
        isAuthenticated={isAuthenticated}
        renderControls={renderControls}
        ticketDetailOverrides={createTicketDetailOverrides}
        stationDetailAction={stationDetailAction}
        stationDetailSecondaryAction={stationDetailSecondaryAction}
        stationPendingCorrectionCount={stationPendingCorrectionCount}
        stationDetailTabPanels={stationDetailTabPanels}
      />
      <TaskMatchDeleteConfirmDialog
        open={Boolean(pendingDeleteTask)}
        task={pendingDeleteTask}
        onCancel={() => setPendingDeleteTask(null)}
        onConfirm={() => {
          if (!pendingDeleteTask) {
            return;
          }

          liveDataStore.dismissMarker(deleteMatchSheet(pendingDeleteTask));
          onReplaceRouteState({
            ...baseRouteState,
            selectedMarkerId:
              baseRouteState.selectedMarkerId === pendingDeleteTask.id
                ? undefined
                : baseRouteState.selectedMarkerId,
          });
          setPendingDeleteTask(null);
        }}
      />
    </>
  );
}

function SiteMapScene({
  createdMarkers,
  createModeActive,
  reportsByStationId,
  onToggleCreateMode,
  onOpenCreateStation,
  onOpenCreateTicket,
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
  onOpenCreateTicket: () => void;
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
      onOpenCreateTicket={onOpenCreateTicket}
      onOpenReport={onOpenReport}
      onOpenShareTarget={onOpenShareTarget}
      onReplaceRouteState={mapRoute.replace}
    />
  );
}

function SiteMapCreatePanels({
  stationDrawerOpen,
  ticketDrawerOpen,
  onCloseStationDrawer,
  onCloseTicketDrawer,
  onCreatedMarker,
}: {
  stationDrawerOpen: boolean;
  ticketDrawerOpen: boolean;
  onCloseStationDrawer: () => void;
  onCloseTicketDrawer: () => void;
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
    <>
      <StationCreateDrawer
        open={stationDrawerOpen}
        onClose={onCloseStationDrawer}
        initialPosition={currentDraftPosition}
        onCreatedMarker={onCreatedMarker}
        onLocationChange={handleDraftLocationChange}
      />
      <TicketCreateDrawer
        open={ticketDrawerOpen}
        onClose={onCloseTicketDrawer}
        initialPosition={currentDraftPosition}
        onCreatedMarker={onCreatedMarker}
        onLocationChange={handleDraftLocationChange}
      />
    </>
  );
}

function SiteMapViewContent() {
  const { reportsByStationId, submitStationReport } = useStationReports();
  const [createdMarkers, setCreatedMarkers] = useState<
    readonly RescueMapMarkerItem[]
  >([]);
  const [createModeActive, setCreateModeActive] = useState(false);
  const [stationDrawerOpen, setStationDrawerOpen] = useState(false);
  const [ticketDrawerOpen, setTicketDrawerOpen] = useState(false);
  const [reportStation, setReportStation] =
    useState<RescueMapMarkerItem | null>(null);
  const [shareTarget, setShareTarget] = useState<PointShareTarget | null>(null);

  const resetCreateFlow = () => {
    setCreateModeActive(false);
  };

  const openCreateMode = (dataType: 'station' | 'ticket') => {
    setCreateModeActive(true);

    if (dataType === 'station') {
      setStationDrawerOpen(true);
      return;
    }

    setTicketDrawerOpen(true);
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
              setTicketDrawerOpen(false);
            }

            return !current;
          })
        }
        onOpenCreateStation={() => openCreateMode('station')}
        onOpenCreateTicket={() => openCreateMode('ticket')}
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
        ticketDrawerOpen={ticketDrawerOpen}
        onCloseStationDrawer={() => {
          setStationDrawerOpen(false);
          resetCreateFlow();
        }}
        onCloseTicketDrawer={() => {
          setTicketDrawerOpen(false);
          resetCreateFlow();
        }}
        onCreatedMarker={(marker) => {
          setCreatedMarkers((current) => [marker, ...current]);
          setStationDrawerOpen(false);
          setTicketDrawerOpen(false);
          resetCreateFlow();
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
