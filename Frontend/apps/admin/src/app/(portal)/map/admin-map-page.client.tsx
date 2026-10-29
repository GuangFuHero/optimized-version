'use client';

import { ClipboardList, X, MapPin } from 'lucide-react';

import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { holdRequest } from './hold-request';

import {
  useAssignZoneToTeam,
  useCapability,
  useCreateArea,
  useDeleteArea,
  usePromoteMarkZone,
  useRemoveZoneFromTeam,
  useTeams,
  useUpdateArea,
} from '@rescue-frontend/data-access/admin';
import {
  AREA_KIND_LABELS,
  areaErrorMessage,
  countInsideArea,
  createSiteMapViewportStore,
  dedupeMarkersById,
  isInArea,
  Map,
  polygonAreaKm2,
  polygonSelfIntersects,
  toGeoJsonPolygon,
  StationCreateDrawer,
  TicketCreateDrawer,
  useAdminMapAreas,
  useAdminMapLiveMarkers,
  viewOfArea,
  type RescueMapDraftArea,
  type RescueMapMarkerItem,
  type RescueMapRouteState,
} from '@rescue-frontend/modules';

import type { AreaActions } from './admin-area-detail-actions';
import {
  AdminAreaDrawPanel,
  AdminAreaFormPanel,
  EMPTY_AREA_FORM,
  type AreaFormValues,
} from './admin-area-draw-panels';
import {
  AdminAreaDetailPanel,
  AdminAreaListPanel,
  toAdminAreaListItems,
} from './admin-area-list-panel';

type CreateMode = 'idle' | 'station' | 'ticket';

// Until the choices are settled with the backend; see `submitArea`.
const DEFAULT_HAZARD_STATUS = 'dangerous';

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
  // What is shown ahead of the backend while a change waits its 5 seconds: a deleted area is gone,
  // a team added or removed is already so.
  const [hiddenAreaIds, setHiddenAreaIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [teamOverrides, setTeamOverrides] = useState<
    Record<string, { names: string[]; uuids: string[] }>
  >({});
  const visibleClosureAreas = useMemo(
    () => areas.closureAreas.filter((area) => !hiddenAreaIds.has(area.id)),
    [areas.closureAreas, hiddenAreaIds],
  );
  const visiblePublicZones = useMemo(
    () =>
      areas.publicZones
        .filter((zone) => !hiddenAreaIds.has(zone.id))
        .map((zone) => {
          const override = teamOverrides[zone.id];

          return override
            ? { ...zone, teams: override.names, teamUuids: override.uuids }
            : zone;
        }),
    [areas.publicZones, hiddenAreaIds, teamOverrides],
  );
  // A fresh answer from the backend has the changes in it: what was shown ahead is not needed.
  useEffect(() => {
    setHiddenAreaIds(new Set());
    setTeamOverrides({});
  }, [areas.closureAreas, areas.publicZones]);
  const closureAreas = useMemo(
    () =>
      visibleClosureAreas.map((area) => ({
        ...area,
        highlighted: area.id === selectedAreaId,
      })),
    [visibleClosureAreas, selectedAreaId],
  );
  const publicZones = useMemo(
    () =>
      visiblePublicZones.map((zone) => ({
        ...zone,
        highlighted: zone.id === selectedAreaId,
      })),
    [visiblePublicZones, selectedAreaId],
  );
  // No API counts what lies in an area, so the list counts the markers the map has loaded.
  const areaListItems = useMemo(
    () =>
      toAdminAreaListItems({
        closureAreas: visibleClosureAreas,
        publicZones: visiblePublicZones,
        countContents: (area) => countInsideArea(area, markers),
      }),
    [visibleClosureAreas, visiblePublicZones, markers],
  );
  const selectedAreaItem =
    areaListItems.find((item) => item.id === selectedAreaId) ?? null;
  const selectedAreaTickets = useMemo(() => {
    const area = [...visibleClosureAreas, ...visiblePublicZones].find(
      (candidate) => candidate.id === selectedAreaId,
    );

    return area
      ? markers.filter(
          (marker) =>
            marker.detailType === 'ticket' && isInArea(marker.position, area),
        )
      : [];
  }, [visibleClosureAreas, visiblePublicZones, markers, selectedAreaId]);
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
      const area = [...visibleClosureAreas, ...visiblePublicZones].find(
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
    [visibleClosureAreas, visiblePublicZones, viewportStore],
  );
  // Drawing a new area: first its corners, then what it is.
  const canDraw = useCapability('work_zone.add').data ?? false;
  const teams = useTeams({ enabled: canDraw });
  const activeTeams = useMemo(
    () => (teams.data ?? []).filter((team) => team.status === 'active'),
    [teams.data],
  );
  const createArea = useCreateArea();
  const [drawStep, setDrawStep] = useState<'idle' | 'drawing' | 'form'>('idle');
  const [drawPoints, setDrawPoints] = useState<[number, number][]>([]);
  const [formValues, setFormValues] = useState<AreaFormValues>(EMPTY_AREA_FORM);
  // The outline of an area sent for creation, kept on the map through the 5 seconds it can be undone.
  const [heldPoints, setHeldPoints] = useState<[number, number][] | null>(null);
  const isDrawing = drawStep !== 'idle';
  const outline = heldPoints ?? (isDrawing ? drawPoints : []);
  const crosses = useMemo(() => polygonSelfIntersects(outline), [outline]);
  const draftArea = useMemo<RescueMapDraftArea | null>(
    () => (outline.length > 0 ? { points: outline, invalid: crosses } : null),
    [crosses, outline],
  );
  const draftContents = useMemo(
    () =>
      drawPoints.length >= 3
        ? countInsideArea({ polygons: [[drawPoints]] }, markers)
        : { tickets: 0, stations: 0 },
    [drawPoints, markers],
  );
  const startDrawing = useCallback(() => {
    setSelectedAreaId(null);
    setRouteState((current) => ({ ...current, selectedMarkerId: undefined }));
    setDrawPoints([]);
    setFormValues(EMPTY_AREA_FORM);
    setDrawStep('drawing');
  }, []);
  const cancelDrawing = useCallback(() => {
    setDrawStep('idle');
    setDrawPoints([]);
    setFormValues(EMPTY_AREA_FORM);
  }, []);
  const undoCorner = useCallback(
    () => setDrawPoints((current) => current.slice(0, -1)),
    [],
  );
  const canFinishOutline = drawPoints.length >= 3 && !crosses;
  useEffect(() => {
    if (drawStep !== 'drawing') {
      return;
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Backspace') {
        event.preventDefault();
        undoCorner();
      } else if (event.key === 'Enter' && canFinishOutline) {
        setDrawStep('form');
      } else if (event.key === 'Escape') {
        cancelDrawing();
      }
    };

    window.addEventListener('keydown', onKey);

    return () => window.removeEventListener('keydown', onKey);
  }, [cancelDrawing, canFinishOutline, drawStep, undoCorner]);
  // The request waits 5 seconds, since there is no way to take a created area back: pressing
  // 復原 within them sends nothing, and puts the form back as it was.
  const submitArea = useCallback(
    (values: AreaFormValues) => {
      if (!values.kind) {
        return;
      }

      const kind = values.kind;
      const points = drawPoints;
      const name = values.name.trim();
      const label = `${AREA_KIND_LABELS[kind]}「${name}」`;
      const input = {
        type: kind,
        geometry: toGeoJsonPolygon(points),
        name,
        note: values.note.trim() || null,
        ...(kind === 'team_zone' ? { teamUuid: values.teamUuid } : {}),
        ...(kind === 'mark_zone' ? { isPublic: values.isPublic } : {}),
        // The backend wants a status for every 危險區 and Notion names no choices for it, so one
        // is sent until the choices are settled (not asked for in the design either).
        ...(kind === 'hazardous_zone' ? { status: DEFAULT_HAZARD_STATUS } : {}),
      };
      const backToForm = () => {
        setHeldPoints(null);
        setDrawPoints(points);
        setFormValues(values);
        setDrawStep('form');
      };

      setHeldPoints(points);
      setDrawStep('idle');
      setDrawPoints([]);
      setFormValues(EMPTY_AREA_FORM);

      holdRequest({
        message: `已建立${label}`,
        onUndo: backToForm,
        send: async () => {
          try {
            const created = await createArea.mutateAsync({ input });

            setHeldPoints(null);
            areas.reload();
            setSelectedAreaId(created.createArea.uuid);
            toast.success(`已建立${label}`);
          } catch (error) {
            backToForm();
            toast.error(areaErrorMessage(error));
          }
        },
      });
    },
    [areas, createArea, drawPoints],
  );
  // The rest of what an admin does to an area (FE-021 items 5-9), for those who may.
  const canEditZone = useCapability('work_zone.edit').data ?? false;
  const canDeleteZone = useCapability('work_zone.delete').data ?? false;
  const canAssignZone = useCapability('work_zone.assign').data ?? false;
  const updateArea = useUpdateArea();
  const deleteArea = useDeleteArea();
  const promoteMarkZone = usePromoteMarkZone();
  const assignZoneToTeam = useAssignZoneToTeam();
  const removeZoneFromTeam = useRemoveZoneFromTeam();
  const areaActions = useMemo<AreaActions | undefined>(() => {
    const area = areaListItems.find((item) => item.id === selectedAreaId);

    if (!area || !(canEditZone || canDeleteZone || canAssignZone)) {
      return undefined;
    }

    const fail = (error: unknown) => {
      toast.error(areaErrorMessage(error));
      areas.reload();
    };
    const label = `${AREA_KIND_LABELS[area.kind]}「${area.name ?? ''}」`;
    const changeTeams = (
      next: { names: string[]; uuids: string[] },
      message: string,
      send: () => Promise<unknown>,
    ) => {
      setTeamOverrides((current) => ({ ...current, [area.id]: next }));
      holdRequest({
        message,
        onUndo: () =>
          setTeamOverrides((current) => {
            const { [area.id]: _undone, ...rest } = current;

            return rest;
          }),
        send: () =>
          send().then(
            () => areas.reload(),
            (error: unknown) => fail(error),
          ),
      });
    };

    return {
      canEdit: canEditZone,
      canDelete: canDeleteZone,
      canAssign: canAssignZone,
      teamOptions: activeTeams,
      onTogglePublic: (isPublic) =>
        void updateArea
          .mutateAsync({ uuid: area.id, input: { isPublic } })
          .then(() => areas.reload(), fail),
      onSave: (changes) =>
        void updateArea
          .mutateAsync({ uuid: area.id, input: changes })
          .then(() => {
            areas.reload();
            toast.success(`已更新${label}`);
          }, fail),
      onPromote: () =>
        void promoteMarkZone
          .mutateAsync({
            uuid: area.id,
            input: { status: DEFAULT_HAZARD_STATUS },
          })
          .then(() => {
            areas.reload();
            toast.success(`${label}已升為危險區`);
          }, fail),
      onDelete: () => {
        setHiddenAreaIds((current) => new Set(current).add(area.id));
        setSelectedAreaId(null);
        holdRequest({
          message: `已刪除${label}`,
          onUndo: () =>
            setHiddenAreaIds((current) => {
              const next = new Set(current);
              next.delete(area.id);

              return next;
            }),
          send: () =>
            deleteArea.mutateAsync({ uuid: area.id }).then(
              () => areas.reload(),
              (error: unknown) => fail(error),
            ),
        });
      },
      onAddTeam: (teamUuid) => {
        const team = activeTeams.find(
          (candidate) => candidate.uuid === teamUuid,
        );

        if (!team) {
          return;
        }

        changeTeams(
          {
            names: [...area.teams, team.name],
            uuids: [...area.teamUuids, team.uuid],
          },
          `已把${label}交給 ${team.name}`,
          () =>
            assignZoneToTeam.mutateAsync({
              input: { zoneUuid: area.id, teamUuid },
            }),
        );
      },
      onRemoveTeam: (teamUuid) => {
        const index = area.teamUuids.indexOf(teamUuid);

        changeTeams(
          {
            names: area.teams.filter((_, i) => i !== index),
            uuids: area.teamUuids.filter((_, i) => i !== index),
          },
          `已移除${label}的 ${area.teams[index] ?? '團隊'}`,
          () =>
            removeZoneFromTeam.mutateAsync({
              input: { zoneUuid: area.id, teamUuid },
            }),
        );
      },
    };
  }, [
    activeTeams,
    areaListItems,
    areas,
    assignZoneToTeam,
    canAssignZone,
    canDeleteZone,
    canEditZone,
    deleteArea,
    promoteMarkZone,
    removeZoneFromTeam,
    selectedAreaId,
    updateArea,
  ]);
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
      const { position, bbox, ...picked } = next;
      // A pin tapped while drawing is a corner missed, not a ticket to open.
      const rest = isDrawing
        ? { ...picked, selectedMarkerId: undefined }
        : picked;

      viewportStore.setState({ position, bbox });
      setRouteState((current) =>
        haveSameNonViewportState(current, rest) ? current : rest,
      );
    },
    [isDrawing, viewportStore],
  );

  const handleMapClick = (position: [number, number]) => {
    if (drawStep === 'drawing') {
      setDrawPoints((current) => [...current, position]);
      return;
    }

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
            draftArea={draftArea}
            cursor={drawStep === 'drawing' ? 'crosshair' : undefined}
            renderControls={() =>
              !isDrawing && (canCreateStation || canCreateTicket) ? (
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
            {drawStep === 'drawing' ? (
              <AdminAreaDrawPanel
                cornerCount={drawPoints.length}
                contents={draftContents}
                areaKm2={polygonAreaKm2(drawPoints)}
                crosses={crosses}
                onUndoCorner={undoCorner}
                onCancel={cancelDrawing}
                onNext={() => setDrawStep('form')}
              />
            ) : drawStep === 'form' ? (
              <AdminAreaFormPanel
                initial={formValues}
                teams={activeTeams}
                isSubmitting={false}
                onBack={(values) => {
                  setFormValues(values);
                  setDrawStep('drawing');
                }}
                onCancel={cancelDrawing}
                onSubmit={submitArea}
              />
            ) : selectedAreaItem ? (
              <AdminAreaDetailPanel
                item={selectedAreaItem}
                tickets={selectedAreaTickets}
                selectedTicketId={routeState.selectedMarkerId}
                actions={areaActions}
                onBack={handleBackToAreaList}
                onSelectTicket={handleSelectAreaTicket}
              />
            ) : (
              <AdminAreaListPanel
                items={areaListItems}
                selectedId={selectedAreaId}
                isLoading={areas.isFetching && !areas.hasFetchedOnce}
                hasError={areas.error !== null}
                canDraw={canDraw}
                onSelect={handleSelectArea}
                onStartDraw={startDrawing}
              />
            )}
          </Box>
        ) : null}
      </Box>

      <StationCreateDrawer
        open={stationDrawerOpen}
        official
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
