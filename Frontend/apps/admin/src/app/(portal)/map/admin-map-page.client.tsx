// SPDX-License-Identifier: GPL-3.0-only
'use client';

import { Box, Stack } from '@mui/material';
import { useEffect, useState } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import { useEventCallback, useEventListener } from 'usehooks-ts';
import { parseAsString, useQueryState } from 'nuqs';
import { useQuery } from '@tanstack/react-query';

import {
  adminZoneTeamsQuery,
  useCapability,
} from '@rescue-frontend/data-access/admin';
import {
  ADMIN_MAP_LIVE_QUERY_LIMIT,
  DEFAULT_ADMIN_MAP_FILTERS,
  filterMarkers,
  isFiltering,
  boundsOfArea,
  createMapViewportStore,
  createAdminAreaEditorStore,
  Map,
  polygonAreaKm2,
  useAdminMapAreas,
  useAdminMapLiveMarkers,
  useAdminAreaChanges,
  useAdminAreaEditor,
  useMarkerDetail,
  AdminMapPinPanel,
  isInView,
  isLocationCellId,
  type AdminMapFilters,
  type RescueMapMarkerItem,
  type RescueMapRouteState,
} from '@rescue-frontend/modules';

import { AdminAreaBoundsPanel } from './admin-area-bounds-panel';
import { AdminMapFilterBar } from './admin-map-filter-bar';
import { AdminMapControls } from './admin-map-controls';
import {
  AdminAreaDrawPanel,
  AdminAreaFormPanel,
} from './admin-area-draw-panels';
import {
  AdminAreaDetailPanel,
  AdminAreaListPanel,
} from './admin-area-list-panel';
import { designTokens } from '@rescue-frontend/ui';
import { useAdminAreaActions } from './use-admin-area-actions';
import { useAdminAreaEditing } from './use-admin-area-editing';
import { projectAdminMapAreas } from './admin-map-area-projection';

const { color } = designTokens;

const AREA_HIGHLIGHT_MS = 2600;

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
  const { data: canViewZones = false, isSuccess: zonesAccessReady } =
    useCapability('work_zone.view');
  const canViewTicketDetail = useCapability('ticket.view_detail').data ?? false;
  const canDraw = useCapability('work_zone.add').data ?? false;
  const canAssignZone = useCapability('work_zone.assign').data ?? false;
  const canEditZone = useCapability('work_zone.edit').data ?? false;
  const canDeleteZone = useCapability('work_zone.delete').data ?? false;
  const zoneTeams = useQuery({
    ...adminZoneTeamsQuery(),
    enabled: canViewZones && canAssignZone,
  });
  const activeTeams = zoneTeams.data?.roleRequestTeams ?? [];
  const teamListError = zoneTeams.isError;
  const areas = useAdminMapAreas({
    enabled: zonesAccessReady,
    includePrivate: canViewZones,
  });
  const areaChanges = useAdminAreaChanges();

  const [map, setMap] = useState<LeafletMap | null>(null);
  const [viewportStore] = useState(() => createMapViewportStore({}));
  const [editorStore] = useState(createAdminAreaEditorStore);
  const [routeState, setRouteState] = useState<RescueMapRouteState>({});
  const [filters, setFilters] = useState<AdminMapFilters>(
    DEFAULT_ADMIN_MAP_FILTERS,
  );
  const editorKind = useAdminAreaEditor(
    editorStore,
    (state) => state.editor?.kind,
  );
  const editingAreaId = useAdminAreaEditor(editorStore, (state) =>
    state.editor?.kind === 'bounds' ? state.editor.areaId : undefined,
  );
  const selectedAreaId = useAdminAreaEditor(
    editorStore,
    (state) => state.selectedAreaId,
  );
  const lastChangedAreaId = useAdminAreaEditor(
    editorStore,
    (state) => state.lastChangedAreaId,
  );
  const selectArea = useAdminAreaEditor(
    editorStore,
    (state) => state.selectArea,
  );
  const highlightArea = useAdminAreaEditor(
    editorStore,
    (state) => state.highlightArea,
  );
  const setEditor = useAdminAreaEditor(editorStore, (state) => state.setEditor);
  const setMetadataEditing = useAdminAreaEditor(
    editorStore,
    (state) => state.setMetadataEditing,
  );

  useEffect(() => {
    if (!lastChangedAreaId) return;
    const timer = window.setTimeout(
      () => highlightArea(null),
      AREA_HIGHLIGHT_MS,
    );
    return () => window.clearTimeout(timer);
  }, [highlightArea, lastChangedAreaId]);

  const { markers, ticketReadFailed, stationReadFailed } =
    useAdminMapLiveMarkers(viewportStore);
  const shownMarkers = filterMarkers(markers, filters);
  const selectedMarkerId = routeState.selectedMarkerId;
  const drawnMarkers = shownMarkers.map((marker) =>
    marker.pin && marker.id === selectedMarkerId
      ? { ...marker, pin: { ...marker.pin, selected: true } }
      : marker,
  );
  const shownTickets = shownMarkers.filter(
    (marker) => marker.detailType === 'ticket',
  ).length;
  const shownStations = shownMarkers.length - shownTickets;
  const ticketsMayBeMore =
    markers.filter((marker) => marker.detailType === 'ticket').length >=
    ADMIN_MAP_LIVE_QUERY_LIMIT;
  const unassignedTickets =
    canViewTicketDetail && !ticketReadFailed
      ? markers.filter(
          (marker) =>
            marker.detailType === 'ticket' &&
            !marker.ticketMeta?.responsibleTeams?.length,
        ).length
      : null;

  const isEditingMetadata = editorKind === 'metadata';
  const isBusy = editorKind === 'draw' || editorKind === 'bounds';
  const {
    visibleAreas,
    selectedArea,
    highlightId,
    closureOverlays,
    publicOverlays,
    countContents,
    areaListItems,
    selectedAreaItem,
    selectedAreaTickets,
  } = projectAdminMapAreas({
    ...areas,
    pending: areaChanges.pending,
    markers,
    selectedAreaId,
    lastChangedAreaId,
    editingAreaId,
    isBusy,
    showOverlays: filters.layers.areas,
    canViewTicketDetail,
    ticketReadFailed,
    stationReadFailed,
  });

  const editedAreaMissing =
    (editorKind === 'bounds' || editorKind === 'metadata') &&
    selectedArea === undefined &&
    areas.hasFetchedOnce &&
    !areas.isFetching &&
    !areas.hasError &&
    !areas.truncated;
  useEffect(() => {
    if (editedAreaMissing) selectArea(null);
  }, [editedAreaMissing, selectArea]);

  const selectedPin =
    markers.find((marker) => marker.id === selectedMarkerId) ?? null;
  const { displayMarker: pin } = useMarkerDetail(
    selectedPin,
    Boolean(selectedMarkerId),
  );
  const pickedPin = pin?.id === selectedMarkerId ? pin : null;
  const closePin = () =>
    setRouteState((current) => ({ ...current, selectedMarkerId: undefined }));
  const returnToList = (highlight: string | null = null) => {
    selectArea(null, highlight);
    closePin();
  };
  const handleSelectAreaTicket = (ticket: RescueMapMarkerItem) => {
    setRouteState((current) => ({ ...current, selectedMarkerId: ticket.id }));
    const view = viewportStore.getState();
    if (!isInView(ticket.position, view.bbox)) {
      viewportStore.setState({
        ...view,
        position: { center: ticket.position, zoom: view.position?.zoom ?? 16 },
      });
    }
  };
  const handleSelectArea = useEventCallback((areaId: string) => {
    const area = visibleAreas.find((candidate) => candidate.id === areaId);
    selectArea(areaId);
    closePin();
    if (!area || !map) return;

    const bounds = boundsOfArea(area);
    if (bounds) {
      const [west, south, east, north] = bounds;
      map.flyToBounds(
        [
          [south, west],
          [north, east],
        ],
        { padding: [64, 64], maxZoom: 17, duration: 0.5 },
      );
    }
  });
  const [zoneParam, setZoneParam] = useQueryState('zone', parseAsString);
  const linkedAreaExists = visibleAreas.some((area) => area.id === zoneParam);
  useEffect(() => {
    if (
      !map ||
      editorKind !== undefined ||
      !zonesAccessReady ||
      !zoneParam ||
      !areas.hasFetchedOnce ||
      areas.isFetching ||
      (areas.hasError && !linkedAreaExists)
    )
      return;

    if (linkedAreaExists) handleSelectArea(zoneParam);
    void setZoneParam(null);
  }, [
    map,
    editorKind,
    zonesAccessReady,
    zoneParam,
    areas.hasFetchedOnce,
    areas.isFetching,
    areas.hasError,
    linkedAreaExists,
    handleSelectArea,
    setZoneParam,
  ]);

  const { draft, bounds, updateArea } = useAdminAreaEditing({
    editorStore,
    changes: areaChanges,
    visibleAreas,
    areaListItems,
    markers,
    selectedMarkerId,
    canDraw,
    canViewTicketDetail,
    ticketReadFailed,
    countContents,
    returnToList,
    teamOptions: activeTeams,
  });
  const areaActions = useAdminAreaActions({
    area: selectedAreaItem,
    polygons: selectedArea?.polygons,
    canEdit: canEditZone,
    canDelete: canDeleteZone,
    canAssign: canAssignZone,
    teamOptions: activeTeams,
    teamListError,
    updateArea,
    returnToList,
    onEditBounds: bounds.start,
  });
  const draw = draft.state;
  const editing = bounds.state;

  useEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.isComposing) return;
    const target = event.target;
    const inInput =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement;
    if (event.key === 'Escape') {
      if (
        inInput ||
        (target instanceof Element && target.closest('[role="dialog"]'))
      )
        return;
      if (pickedPin) closePin();
      else if (editorKind) setEditor(null);
      else returnToList();
      return;
    }
    if (draw?.step !== 'drawing' || inInput) return;
    if (event.key === 'Backspace') {
      event.preventDefault();
      draft.undoCorner();
    } else if (event.key === 'Enter') {
      if (
        target instanceof Element &&
        target.closest('button, a, select, [role="button"]')
      )
        return;
      event.preventDefault();
      draft.finish();
    }
  });

  const handleRouteStateChange = (next: RescueMapRouteState) => {
    const { position, bbox, ...picked } = next;
    const rest = isBusy ? { ...picked, selectedMarkerId: undefined } : picked;
    if (position || bbox) {
      const view = viewportStore.getState();
      viewportStore.setState({
        position: position ?? view.position,
        bbox: bbox ?? view.bbox,
      });
    }
    setRouteState((current) =>
      haveSameNonViewportState(current, rest) ? current : rest,
    );
  };

  const handleMapClick = () => {
    if (isBusy) return;
    if (pickedPin) closePin();
    else if (!isEditingMetadata) returnToList();
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { mobile: 'column', tablet: 'row' },
        width: '100%',
        // The shell's <main> is the screen less its header: filling it, not the whole screen,
        // keeps the page from scrolling and the area list's button in view. On a phone the
        // map and the panel stack and the page scrolls.
        height: { tablet: '100%' },
        minHeight: { mobile: '100%', tablet: 0 },
      }}
    >
      <Box
        sx={{
          position: 'relative',
          flex: { mobile: 'none', tablet: 1 },
          minWidth: 0,
          // A height, not a min-height: the map inside is 100% of this box, and 100% of a
          // min-height is nothing, which left the phone with no map at all.
          height: { mobile: '60dvh', tablet: 'auto' },
        }}
      >
        <Map
          markers={drawnMarkers}
          closureAreas={closureOverlays}
          publicZones={publicOverlays}
          routeState={routeState}
          onRouteStateChange={handleRouteStateChange}
          viewportStore={viewportStore}
          onMapReady={setMap}
          showScale
          viewMemoryKey="mutual-aid"
          // Beside the map instead (MAP-SCOPE-101), for whoever has the panel it goes in. A grid
          // cell has no such panel: it lists the coarse tickets inside it, in the drawer.
          hideDetailDrawer={
            canViewZones && !isLocationCellId(routeState.selectedMarkerId)
          }
          onMapClick={handleMapClick}
          draftArea={draft.overlay}
          editArea={bounds.overlay}
          cursor={draw?.step === 'drawing' ? 'crosshair' : undefined}
          disableDoubleClickZoom={isBusy}
          editingArea={isBusy}
          adminAreaStyle
          renderControls={() => (
            <AdminMapControls
              isDrawing={draw?.step === 'drawing'}
              isBusy={isBusy}
            >
              <AdminMapFilterBar
                filters={filters}
                onChange={setFilters}
                shownTickets={shownTickets}
                shownStations={shownStations}
                ticketReadFailed={ticketReadFailed}
                stationReadFailed={stationReadFailed}
                ticketsMayBeMore={ticketsMayBeMore}
                canFilterByAssignment={canViewTicketDetail}
                unassignedTickets={unassignedTickets}
                isFiltered={isFiltering(filters)}
                disabled={isBusy}
              />
            </AdminMapControls>
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
            height: { tablet: '100%' },
            minHeight: 0,
            borderLeft: { tablet: `1px solid ${color.border.default}` },
            bgcolor: color.bg.neutral.subtle,
          }}
        >
          {draw?.step === 'drawing' ? (
            <AdminAreaDrawPanel
              cornerCount={draw.points.length}
              contents={draft.contents}
              areaKm2={polygonAreaKm2(draw.points)}
              crosses={draft.crosses}
              onUndoCorner={draft.undoCorner}
              onCancel={() => setEditor(null)}
              onNext={draft.finish}
            />
          ) : draw?.step === 'form' ? (
            <AdminAreaFormPanel
              initial={draw.values}
              teams={activeTeams}
              teamListError={teamListError}
              tickets={draft.tickets}
              canAssign={canAssignZone}
              onBack={draft.back}
              onCancel={() => setEditor(null)}
              onSubmit={draft.submit}
            />
          ) : editing && bounds.area ? (
            <AdminAreaBoundsPanel
              name={bounds.area.name}
              isTeamZone={bounds.item?.kind === 'team_zone'}
              teams={bounds.item?.teams.map((team) => team.name) ?? []}
              cornerCount={editing.points.length}
              change={bounds.change}
              areaKm2={polygonAreaKm2(editing.points)}
              crosses={bounds.crosses}
              changed={bounds.changed}
              onReset={bounds.reset}
              onCancel={() => setEditor(null)}
              onSave={bounds.save}
            />
          ) : selectedAreaItem ? (
            <>
              {pickedPin ? (
                <AdminMapPinPanel
                  marker={pickedPin}
                  backLabel={`回到「${selectedAreaItem.name ?? '區域'}」`}
                  onBack={closePin}
                />
              ) : null}
              {/* Stays mounted under the pin: an area's edit form must not lose what was typed. */}
              <Stack
                sx={{
                  display: pickedPin ? 'none' : 'flex',
                  flex: 1,
                  minHeight: 0,
                }}
              >
                <AdminAreaDetailPanel
                  key={selectedAreaItem.id}
                  item={selectedAreaItem}
                  tickets={ticketReadFailed ? null : selectedAreaTickets}
                  selectedTicketId={routeState.selectedMarkerId}
                  actions={areaActions}
                  editing={isEditingMetadata}
                  onEditingChange={(editing) =>
                    setMetadataEditing(selectedAreaItem.id, editing)
                  }
                  onBack={() => returnToList()}
                  onSelectTicket={handleSelectAreaTicket}
                />
              </Stack>
            </>
          ) : pickedPin ? (
            <AdminMapPinPanel
              marker={pickedPin}
              backLabel="回到區域清單"
              onBack={closePin}
            />
          ) : (
            <AdminAreaListPanel
              items={areaListItems}
              selectedId={highlightId}
              isLoading={areas.isFetching && !areas.hasFetchedOnce}
              hasError={areas.hasError}
              truncated={areas.truncated}
              canDraw={canDraw}
              hasDraft={draft.hasRecoverable}
              onSelect={handleSelectArea}
              onStartDraw={draft.canStart ? draft.start : undefined}
            />
          )}
        </Box>
      ) : null}
    </Box>
  );
}
