'use client';

import { Box, Stack } from '@mui/material';
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
  boundaryChange,
  editableOutline,
  DEFAULT_ADMIN_MAP_FILTERS,
  filterMarkers,
  isFiltering,
  areaErrorMessage,
  countInsideArea,
  createSiteMapViewportStore,
  isInArea,
  Map,
  polygonAreaKm2,
  polygonSelfIntersects,
  toGeoJsonPolygon,
  useAdminMapAreas,
  useAdminMapLiveMarkers,
  viewOfArea,
  type AdminMapFilters,
  type RescueMapDraftArea,
  type RescueMapEditArea,
  type RescueMapMarkerItem,
  type RescueMapRouteState,
} from '@rescue-frontend/modules';

import type { AreaActions } from './admin-area-detail-actions';
import { AdminAreaBoundsPanel } from './admin-area-bounds-panel';
import { AdminMapFilterBar } from './admin-map-filter-bar';
import { AdminMapLegend } from './admin-map-legend';
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

// 危險區 has no status in the UI (Carol: skip it; areas can be edited and deleted directly, so no
// open/closed state is needed). The backend still refuses a blank one, and nothing reads it, so this
// fixed value is sent on create and on promote.
const NO_AREAS: never[] = [];

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

export function AdminMapPageClient() {
  // The area layer and its list are for those who may see work zones; the rest see the map alone.
  const canViewZones = useCapability('work_zone.view').data ?? false;
  const [viewportStore] = useState(() => createSiteMapViewportStore({}));
  const [routeState, setRouteState] = useState<RescueMapRouteState>({});
  const liveMarkers = useAdminMapLiveMarkers(viewportStore);
  const markers = liveMarkers.markers;
  // What the map shows. A way of looking, not of choosing: the area list counts all `markers`.
  const [filters, setFilters] = useState<AdminMapFilters>(
    DEFAULT_ADMIN_MAP_FILTERS,
  );
  const shownMarkers = useMemo(
    () => filterMarkers(markers, filters),
    [filters, markers],
  );
  const shownTickets = shownMarkers.filter(
    (marker) => marker.detailType === 'ticket',
  ).length;
  const shownStations = shownMarkers.length - shownTickets;
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
  // A boundary saved and waiting its 5 seconds is drawn where it was moved to.
  const [geometryOverrides, setGeometryOverrides] = useState<
    Record<string, [number, number][][][]>
  >({});
  // Changing the boundary of an area: its corners as they began, and as they are now.
  const [editing, setEditing] = useState<{
    areaId: string;
    original: [number, number][];
    points: [number, number][];
  } | null>(null);
  const visibleClosureAreas = useMemo(
    () =>
      areas.closureAreas
        .filter((area) => !hiddenAreaIds.has(area.id))
        .map((area) =>
          geometryOverrides[area.id]
            ? { ...area, polygons: geometryOverrides[area.id] }
            : area,
        ),
    [areas.closureAreas, geometryOverrides, hiddenAreaIds],
  );
  const visiblePublicZones = useMemo(
    () =>
      areas.publicZones
        .filter((zone) => !hiddenAreaIds.has(zone.id))
        .map((zone) => {
          const override = teamOverrides[zone.id];
          const shaped = geometryOverrides[zone.id]
            ? { ...zone, polygons: geometryOverrides[zone.id] }
            : zone;

          return override
            ? { ...shaped, teams: override.names, teamUuids: override.uuids }
            : shaped;
        }),
    [areas.publicZones, geometryOverrides, hiddenAreaIds, teamOverrides],
  );
  // A fresh answer from the backend has the changes in it: what was shown ahead is not needed.
  useEffect(() => {
    setHiddenAreaIds(new Set());
    setTeamOverrides({});
    setGeometryOverrides({});
  }, [areas.closureAreas, areas.publicZones]);
  const closureAreas = useMemo(
    () =>
      visibleClosureAreas
        .filter((area) => area.id !== editing?.areaId)
        .map((area) => ({
          ...area,
          highlighted: area.id === selectedAreaId,
        })),
    [editing?.areaId, visibleClosureAreas, selectedAreaId],
  );
  const publicZones = useMemo(
    () =>
      visiblePublicZones
        .filter((zone) => zone.id !== editing?.areaId)
        .map((zone) => ({
          ...zone,
          highlighted: zone.id === selectedAreaId,
        })),
    [editing?.areaId, visiblePublicZones, selectedAreaId],
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
    // While its boundary is changed, Esc is for that: back to the area, not out of it.
    if (!selectedAreaId || editing) {
      return;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleBackToAreaList();
      }
    };

    window.addEventListener('keydown', closeOnEscape);

    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [editing, handleBackToAreaList, selectedAreaId]);
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
  // While a boundary is drawn or changed, nothing else on the page is to be started or opened.
  const isBusy = isDrawing || editing !== null;
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
  // Changing the boundary of the area on show (FE-021 item 5, MAP-ZD-191 to 199).
  const editedArea = useMemo(
    () =>
      editing
        ? ([...visibleClosureAreas, ...visiblePublicZones].find(
            (area) => area.id === editing.areaId,
          ) ?? null)
        : null,
    [editing, visibleClosureAreas, visiblePublicZones],
  );
  const editedItem = editing
    ? areaListItems.find((item) => item.id === editing.areaId)
    : undefined;
  const editCrosses = useMemo(
    () => (editing ? polygonSelfIntersects(editing.points) : false),
    [editing],
  );
  const editChange = useMemo(
    () =>
      editing
        ? boundaryChange(
            { polygons: [[editing.original]] },
            { polygons: [[editing.points]] },
            markers,
          )
        : { inside: 0, added: 0, removed: 0 },
    [editing, markers],
  );
  const editChanged =
    editing !== null &&
    (editing.points.length !== editing.original.length ||
      editing.points.some(
        (point, index) =>
          point[0] !== editing.original[index][0] ||
          point[1] !== editing.original[index][1],
      ));
  const editArea = useMemo<RescueMapEditArea | null>(
    () =>
      editing
        ? {
            points: editing.points,
            invalid: editCrosses,
            onChange: (points) =>
              setEditing((current) =>
                current ? { ...current, points } : null,
              ),
          }
        : null,
    [editCrosses, editing],
  );
  const cancelEditing = useCallback(() => setEditing(null), []);
  useEffect(() => {
    if (!editing) {
      return;
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setEditing(null);
      }
    };

    window.addEventListener('keydown', onKey);

    return () => window.removeEventListener('keydown', onKey);
  }, [editing]);
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
    const shape = [...visibleClosureAreas, ...visiblePublicZones].find(
      (candidate) => candidate.id === area.id,
    );
    const outline = shape ? editableOutline(shape.polygons) : null;
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
      canEditBounds: outline !== null,
      onEditBounds: () => {
        if (outline) {
          setEditing({
            areaId: area.id,
            original: outline,
            points: outline.map((point): [number, number] => [...point]),
          });
        }
      },
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
    visibleClosureAreas,
    visiblePublicZones,
  ]);
  // Saving the new boundary: shown at once, sent after the 5 seconds in which it can be taken back.
  const saveBoundary = useCallback(() => {
    if (!editing || !editedArea) {
      return;
    }

    const { areaId, points } = editing;
    const name = editedArea.name ? `「${editedArea.name}」` : '這個區域';

    setGeometryOverrides((current) => ({ ...current, [areaId]: [[points]] }));
    setEditing(null);
    holdRequest({
      message: `已調整${name}的範圍`,
      onUndo: () =>
        setGeometryOverrides((current) => {
          const { [areaId]: _undone, ...rest } = current;

          return rest;
        }),
      send: () =>
        updateArea
          .mutateAsync({
            uuid: areaId,
            input: { geometry: toGeoJsonPolygon(points) },
          })
          .then(
            () => areas.reload(),
            (error: unknown) => {
              toast.error(areaErrorMessage(error));
              areas.reload();
            },
          ),
    });
  }, [areas, editedArea, editing, updateArea]);
  const handleRouteStateChange = useCallback(
    (next: RescueMapRouteState) => {
      const { position, bbox, ...picked } = next;
      // A pin tapped while drawing is a corner missed, not a ticket to open.
      const rest = isBusy ? { ...picked, selectedMarkerId: undefined } : picked;

      viewportStore.setState({ position, bbox });
      setRouteState((current) =>
        haveSameNonViewportState(current, rest) ? current : rest,
      );
    },
    [isBusy, viewportStore],
  );

  const handleMapClick = (position: [number, number]) => {
    if (drawStep === 'drawing') {
      setDrawPoints((current) => [...current, position]);
      return;
    }

    if (editing) {
      return;
    }

    setSelectedAreaId(null);
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
            markers={shownMarkers}
            closureAreas={filters.layers.areas ? closureAreas : NO_AREAS}
            publicZones={filters.layers.areas ? publicZones : NO_AREAS}
            routeState={routeState}
            onRouteStateChange={handleRouteStateChange}
            viewportStore={viewportStore}
            showScale
            onMapClick={handleMapClick}
            draftArea={draftArea}
            editArea={editArea}
            cursor={drawStep === 'drawing' ? 'crosshair' : undefined}
            renderControls={() => (
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
                    top: 12,
                    left: 12,
                    pointerEvents: 'auto',
                    maxWidth: 'calc(100vw - 56px)',
                  }}
                >
                  <AdminMapFilterBar
                    filters={filters}
                    onChange={setFilters}
                    shownTickets={shownTickets}
                    shownStations={shownStations}
                    isFiltered={isFiltering(filters)}
                    disabled={isBusy}
                  />
                </Stack>
                {/* Put away while drawing: what is wanted then is the counts, not the colours. */}
                {!isBusy ? (
                  <Box
                    sx={{
                      position: 'absolute',
                      left: 12,
                      bottom: 28,
                      pointerEvents: 'auto',
                    }}
                  >
                    <AdminMapLegend />
                  </Box>
                ) : null}
              </Box>
            )}
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
            ) : editing && editedArea ? (
              <AdminAreaBoundsPanel
                name={editedArea.name}
                isTeamZone={editedItem?.kind === 'team_zone'}
                teams={editedItem?.teams ?? []}
                cornerCount={editing.points.length}
                change={editChange}
                areaKm2={polygonAreaKm2(editing.points)}
                crosses={editCrosses}
                changed={editChanged}
                onReset={() =>
                  setEditing((current) =>
                    current
                      ? {
                          ...current,
                          points: current.original.map(
                            (point): [number, number] => [...point],
                          ),
                        }
                      : null,
                  )
                }
                onCancel={cancelEditing}
                onSave={saveBoundary}
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
    </>
  );
}
