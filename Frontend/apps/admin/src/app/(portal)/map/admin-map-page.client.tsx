'use client';

import { ClipboardList, X, MapPin } from 'lucide-react';

import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useCapability } from '@rescue-frontend/data-access/admin';
import {
  countInsideArea,
  createSiteMapViewportStore,
  dedupeMarkersById,
  isInArea,
  Map,
  StationCreateDrawer,
  TicketCreateDrawer,
  useAdminMapAreas,
  useAdminMapLiveMarkers,
  viewOfArea,
  type RescueMapMarkerItem,
  type RescueMapRouteState,
} from '@rescue-frontend/modules';

import {
  AdminAreaDetailPanel,
  AdminAreaListPanel,
  toAdminAreaListItems,
} from './admin-area-list-panel';

type CreateMode = 'idle' | 'station' | 'ticket';

// Everything but where the map looks: the view goes to its own store, so panning does not
// re-render this page.
function haveSameNonViewportState(
  current: RescueMapRouteState,
  next: RescueMapRouteState,
): boolean {
  return (
    current.baseLayer === next.baseLayer &&
    current.dataType === next.dataType &&
    current.search === next.search &&
    current.selectedMarkerId === next.selectedMarkerId &&
    (current.subDataTypes ?? []).join(',') ===
      (next.subDataTypes ?? []).join(',')
  );
}

function formatCoordinate(value: number) {
  return value.toFixed(6);
}

function ControlChip({
  label,
  active,
  icon,
  onClick,
}: {
  label: string;
  active?: boolean;
  icon: React.ReactNode;
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
        border: `1px solid ${active ? '#E3791E' : '#DCC1B1'}`,
        bgcolor: active ? '#FFF1E5' : '#F6FAFF',
        color: active ? '#7A3E00' : '#151C22',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
      }}
    >
      <Box sx={{ display: 'grid', placeItems: 'center' }}>{icon}</Box>
      <Typography sx={{ fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' }}>
        {label}
      </Typography>
    </ButtonBase>
  );
}

function AdminMapCreateControls({
  mode,
  pendingPosition,
  canCreateStation,
  canCreateTicket,
  onToggleMode,
  onCancel,
}: {
  mode: CreateMode;
  canCreateStation: boolean;
  canCreateTicket: boolean;
  pendingPosition: [number, number] | null;
  onToggleMode: (mode: CreateMode) => void;
  onCancel: () => void;
}) {
  const helperText =
    mode === 'station'
      ? '點擊地圖放置新站點圖釘'
      : mode === 'ticket'
        ? '點擊地圖放置新任務圖釘'
        : '選擇新增模式後，直接點地圖落點';

  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        zIndex: 1400,
        pointerEvents: 'none',
      }}
    >
      <Stack
        spacing={1}
        sx={{
          position: 'absolute',
          top: 16,
          left: 16,
          pointerEvents: 'auto',
          maxWidth: { mobile: 'calc(100vw - 32px)', tablet: 420 },
        }}
      >
        <Box
          sx={{
            p: 1,
            borderRadius: 4,
            bgcolor: 'rgba(246, 250, 255, 0.94)',
            backdropFilter: 'blur(8px)',
            border: '1px solid #DCC1B1',
            boxShadow: '0 12px 30px rgba(21, 28, 34, 0.12)',
          }}
        >
          <Stack spacing={1}>
            <Stack
              direction="row"
              spacing={1}
              sx={{ flexWrap: 'wrap', rowGap: 1 }}
            >
              {canCreateStation ? (
                <ControlChip
                  label="新增站點"
                  active={mode === 'station'}
                  icon={
                    <Box component={MapPin} sx={{ width: 18, height: 18 }} />
                  }
                  onClick={() =>
                    onToggleMode(mode === 'station' ? 'idle' : 'station')
                  }
                />
              ) : null}
              {canCreateTicket ? (
                <ControlChip
                  label="新增任務"
                  active={mode === 'ticket'}
                  icon={
                    <Box
                      component={ClipboardList}
                      sx={{ width: 18, height: 18 }}
                    />
                  }
                  onClick={() =>
                    onToggleMode(mode === 'ticket' ? 'idle' : 'ticket')
                  }
                />
              ) : null}
              {mode !== 'idle' ? (
                <ControlChip
                  label="取消"
                  icon={<Box component={X} sx={{ width: 18, height: 18 }} />}
                  onClick={onCancel}
                />
              ) : null}
            </Stack>
            <Typography sx={{ fontSize: 12, color: '#564337' }}>
              {helperText}
            </Typography>
            {pendingPosition ? (
              <Typography
                sx={{ fontSize: 12, color: '#7A3E00', fontWeight: 700 }}
              >
                目前落點：{formatCoordinate(pendingPosition[0])},{' '}
                {formatCoordinate(pendingPosition[1])}
              </Typography>
            ) : null}
          </Stack>
        </Box>
      </Stack>
    </Box>
  );
}

export function AdminMapPageClient() {
  const canCreateStation = useCapability('station.add').data ?? false;
  const canCreateTicket = useCapability('ticket.add').data ?? false;
  // The area layer and its list are for those who may see work zones; the rest see the map alone.
  const canViewZones = useCapability('work_zone.view').data ?? false;
  const [viewportStore] = useState(() => createSiteMapViewportStore({}));
  const [routeState, setRouteState] = useState<RescueMapRouteState>({});
  const liveMarkers = useAdminMapLiveMarkers(viewportStore);
  // One made here stays on the map until the view fetches it too; from then on the fetched one,
  // being fresher, is the one shown.
  const [createdMarkers, setCreatedMarkers] = useState<
    readonly RescueMapMarkerItem[]
  >([]);
  const markers = useMemo(
    () => dedupeMarkersById([...liveMarkers.markers, ...createdMarkers]),
    [createdMarkers, liveMarkers.markers],
  );
  const areas = useAdminMapAreas({ enabled: canViewZones });
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const closureAreas = useMemo(
    () =>
      areas.closureAreas.map((area) => ({
        ...area,
        highlighted: area.id === selectedAreaId,
      })),
    [areas.closureAreas, selectedAreaId],
  );
  const publicZones = useMemo(
    () =>
      areas.publicZones.map((zone) => ({
        ...zone,
        highlighted: zone.id === selectedAreaId,
      })),
    [areas.publicZones, selectedAreaId],
  );
  // No API counts what lies in an area, so the list counts the markers the map has loaded.
  const areaListItems = useMemo(
    () =>
      toAdminAreaListItems({
        closureAreas: areas.closureAreas,
        publicZones: areas.publicZones,
        countContents: (area) => countInsideArea(area, markers),
      }),
    [areas.closureAreas, areas.publicZones, markers],
  );
  const selectedAreaItem =
    areaListItems.find((item) => item.id === selectedAreaId) ?? null;
  const selectedAreaTickets = useMemo(() => {
    const area = [...areas.closureAreas, ...areas.publicZones].find(
      (candidate) => candidate.id === selectedAreaId,
    );

    return area
      ? markers.filter(
          (marker) =>
            marker.detailType === 'ticket' && isInArea(marker.position, area),
        )
      : [];
  }, [areas.closureAreas, areas.publicZones, markers, selectedAreaId]);
  const handleBackToAreaList = useCallback(() => {
    setSelectedAreaId(null);
    setRouteState((current) => ({ ...current, selectedMarkerId: undefined }));
  }, []);
  // Opens the ticket's detail the way a pin does, and brings the map to it.
  const handleSelectAreaTicket = useCallback(
    (ticket: RescueMapMarkerItem) => {
      setRouteState((current) => ({
        ...current,
        selectedMarkerId: ticket.id,
      }));
      viewportStore.setState({
        ...viewportStore.getSnapshot(),
        position: {
          center: ticket.position,
          zoom: viewportStore.getSnapshot().position?.zoom ?? 16,
        },
      });
    },
    [viewportStore],
  );
  useEffect(() => {
    if (!selectedAreaId) {
      return;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleBackToAreaList();
      }
    };

    window.addEventListener('keydown', closeOnEscape);

    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [handleBackToAreaList, selectedAreaId]);
  const handleSelectArea = useCallback(
    (areaId: string) => {
      const area = [...areas.closureAreas, ...areas.publicZones].find(
        (candidate) => candidate.id === areaId,
      );
      const view = area ? viewOfArea(area) : null;

      setSelectedAreaId(areaId);

      if (view) {
        viewportStore.setState({
          position: { center: view.center, zoom: view.zoom },
          bbox: view.bbox,
        });
      }
    },
    [areas.closureAreas, areas.publicZones, viewportStore],
  );
  const [createMode, setCreateMode] = useState<CreateMode>('idle');
  const [pendingPosition, setPendingPosition] = useState<
    [number, number] | null
  >(null);
  const [stationDrawerOpen, setStationDrawerOpen] = useState(false);
  const [ticketDrawerOpen, setTicketDrawerOpen] = useState(false);

  const currentInitialPosition = useMemo(
    () => pendingPosition,
    [pendingPosition],
  );
  const handleRouteStateChange = useCallback(
    (next: RescueMapRouteState) => {
      const { position, bbox, ...rest } = next;

      viewportStore.setState({ position, bbox });
      setRouteState((current) =>
        haveSameNonViewportState(current, rest) ? current : rest,
      );
    },
    [viewportStore],
  );

  const handleMapClick = (position: [number, number]) => {
    if (createMode === 'idle') {
      setSelectedAreaId(null);
      return;
    }

    setPendingPosition(position);

    if (createMode === 'station') {
      setStationDrawerOpen(true);
      return;
    }

    if (createMode === 'ticket') {
      setTicketDrawerOpen(true);
    }
  };

  const resetCreateFlow = () => {
    setCreateMode('idle');
    setPendingPosition(null);
  };

  return (
    <>
      <Box
        sx={{
          display: 'flex',
          flexDirection: { mobile: 'column', tablet: 'row' },
          width: '100%',
          height: '100%',
          minHeight: '100dvh',
        }}
      >
        <Box
          sx={{
            position: 'relative',
            flex: 1,
            minWidth: 0,
            minHeight: '60dvh',
          }}
        >
          <Map
            markers={markers}
            closureAreas={closureAreas}
            publicZones={publicZones}
            routeState={routeState}
            onRouteStateChange={handleRouteStateChange}
            viewportStore={viewportStore}
            showScale
            onMapClick={handleMapClick}
            renderControls={() =>
              canCreateStation || canCreateTicket ? (
                <AdminMapCreateControls
                  mode={createMode}
                  pendingPosition={pendingPosition}
                  canCreateStation={canCreateStation}
                  canCreateTicket={canCreateTicket}
                  onToggleMode={setCreateMode}
                  onCancel={resetCreateFlow}
                />
              ) : null
            }
          />
        </Box>
        {canViewZones ? (
          <Box
            component="aside"
            sx={{
              display: 'flex',
              flexDirection: 'column',
              width: { mobile: '100%', tablet: 360 },
              flexShrink: 0,
              position: { tablet: 'sticky' },
              top: 0,
              height: { tablet: '100dvh' },
              borderLeft: { tablet: '1px solid #DCC1B1' },
              bgcolor: '#F6FAFF',
            }}
          >
            {selectedAreaItem ? (
              <AdminAreaDetailPanel
                item={selectedAreaItem}
                tickets={selectedAreaTickets}
                selectedTicketId={routeState.selectedMarkerId}
                onBack={handleBackToAreaList}
                onSelectTicket={handleSelectAreaTicket}
              />
            ) : (
              <AdminAreaListPanel
                items={areaListItems}
                selectedId={selectedAreaId}
                isLoading={areas.isFetching && !areas.hasFetchedOnce}
                hasError={areas.error !== null}
                onSelect={handleSelectArea}
              />
            )}
          </Box>
        ) : null}
      </Box>

      <StationCreateDrawer
        open={stationDrawerOpen}
        onClose={() => {
          setStationDrawerOpen(false);
          resetCreateFlow();
        }}
        initialPosition={currentInitialPosition}
        onCreatedMarker={(marker) => {
          setCreatedMarkers((current) => [marker, ...current]);
        }}
      />

      <TicketCreateDrawer
        open={ticketDrawerOpen}
        onClose={() => {
          setTicketDrawerOpen(false);
          resetCreateFlow();
        }}
        initialPosition={currentInitialPosition}
        onCreatedMarker={(marker) => {
          setCreatedMarkers((current) => [marker, ...current]);
        }}
      />
    </>
  );
}
