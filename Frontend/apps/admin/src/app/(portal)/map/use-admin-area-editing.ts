'use client';

import { useEffect, useRef } from 'react';
import { useEventCallback } from 'usehooks-ts';
import {
  useCreateArea,
  useUpdateArea,
  type CreateAreaInput,
} from '@rescue-frontend/data-access/admin';
import {
  AREA_KIND_LABELS,
  EMPTY_AREA_FORM,
  boundaryChange,
  isInArea,
  polygonSelfIntersects,
  toGeoJsonPolygon,
  useAdminAreaEditor,
  type AreaChanges,
  type RescueMapAreaTeam,
  type AreaFormValues,
  type createAdminAreaEditorStore,
  type DrawEditor,
  type RescueMapArea,
  type RescueMapDraftArea,
  type RescueMapEditArea,
  type RescueMapMarkerItem,
} from '@rescue-frontend/modules';
import type {
  AdminAreaListItem,
  projectAdminMapAreas,
} from './admin-map-area-projection';

const DEFAULT_HAZARD_STATUS = 'dangerous';
const DOUBLE_CLICK_MS = 500;

type EditorStore = ReturnType<typeof createAdminAreaEditorStore>;
type Coordinates = RescueMapArea['polygons'][number][number][number];

interface AreaEditingOptions {
  editorStore: EditorStore;
  changes: Pick<
    AreaChanges,
    | 'hold'
    | 'heldDraft'
    | 'holdDraft'
    | 'recoverableDraft'
    | 'recoverDraft'
    | 'bindView'
  >;
  visibleAreas: readonly RescueMapArea[];
  areaListItems: readonly AdminAreaListItem[];
  markers: readonly RescueMapMarkerItem[];
  selectedMarkerId?: string;
  canDraw: boolean;
  canViewTicketDetail: boolean;
  ticketReadFailed: boolean;
  countContents: ReturnType<typeof projectAdminMapAreas>['countContents'];
  teamOptions: readonly RescueMapAreaTeam[];
  returnToList: (highlight?: string | null) => void;
}

export function useAdminAreaEditing({
  editorStore,
  changes,
  visibleAreas,
  areaListItems,
  markers,
  selectedMarkerId,
  canDraw,
  canViewTicketDetail,
  ticketReadFailed,
  countContents,
  teamOptions,
  returnToList,
}: AreaEditingOptions) {
  const createArea = useCreateArea();
  const updateArea = useUpdateArea();
  const {
    hold,
    heldDraft,
    holdDraft,
    recoverableDraft,
    recoverDraft,
    bindView,
  } = changes;
  const editor = useAdminAreaEditor(editorStore, (state) => state.editor);
  const { setEditor, highlightArea } = editorStore.getState();
  const draw = editor?.kind === 'draw' ? editor : null;
  const editing = editor?.kind === 'bounds' ? editor : null;
  const lastCornerAt = useRef(0);

  const outline = draw?.points ?? heldDraft?.points ?? [];
  const crosses = draw !== null && polygonSelfIntersects(draw.points);
  const draftArea = (
    outline.length > 0 ? { points: outline, invalid: crosses } : null
  ) satisfies RescueMapDraftArea | null;
  const draftGeometry =
    draw && draw.points.length >= 3 ? { polygons: [[draw.points]] } : null;
  const draftContents = countContents(draftGeometry);
  const draftTickets =
    draw?.step === 'form' &&
    draftGeometry &&
    canViewTicketDetail &&
    !ticketReadFailed
      ? markers.filter(
          (marker) =>
            marker.detailType === 'ticket' &&
            !marker.locationCell &&
            isInArea(marker.position, draftGeometry),
        )
      : null;
  const canFinishOutline = draw !== null && draw.points.length >= 3 && !crosses;

  const startDrawing = () => {
    returnToList();
    lastCornerAt.current = 0;
    setEditor(
      recoverableDraft ?? {
        kind: 'draw',
        step: 'drawing',
        points: [],
        values: EMPTY_AREA_FORM,
      },
    );
    recoverDraft(null);
  };
  const undoCorner = () => {
    if (draw) setEditor({ ...draw, points: draw.points.slice(0, -1) });
  };
  const finishOutline = () => {
    if (canFinishOutline) setEditor({ ...draw, step: 'form' });
  };
  const returnToOutline = (values: AreaFormValues) => {
    if (!draw) return;
    lastCornerAt.current = 0;
    setEditor({ ...draw, step: 'drawing', values });
  };
  const addCorner = (position: Coordinates) => {
    if (draw?.step !== 'drawing') return;
    const last = draw.points.at(-1);
    const now = Date.now();
    if (last && last[0] === position[0] && last[1] === position[1]) {
      if (now - lastCornerAt.current < DOUBLE_CLICK_MS) finishOutline();
      return;
    }
    lastCornerAt.current = now;
    setEditor({ ...draw, points: [...draw.points, position] });
  };

  const canRestoreDraft = useEventCallback(() => {
    const { editor, selectedAreaId } = editorStore.getState();
    return !editor && !selectedAreaId && !selectedMarkerId && canDraw;
  });
  const restoreDraftInView = useEventCallback((draft: DrawEditor) => {
    if (!canRestoreDraft()) return false;
    setEditor(draft);
    return true;
  });
  const highlightCreatedArea = useEventCallback((uuid: string) => {
    if (canRestoreDraft()) highlightArea(uuid);
  });
  useEffect(
    () =>
      bindView({
        restoreDraft: restoreDraftInView,
        highlightArea: highlightCreatedArea,
      }),
    [bindView, highlightCreatedArea, restoreDraftInView],
  );

  const submitArea = (values: AreaFormValues) => {
    if (
      !draw ||
      draw.step !== 'form' ||
      !canFinishOutline ||
      !values.kind ||
      heldDraft
    )
      return;
    if (
      values.kind === 'team_zone' &&
      !teamOptions.some((team) => team.uuid === values.teamUuid)
    )
      return;

    const draft = { ...draw, values };
    const input: CreateAreaInput = {
      type: values.kind,
      geometry: toGeoJsonPolygon(draft.points),
      name: values.name.trim(),
      note: values.note.trim() || null,
    };
    if (values.kind === 'team_zone') input.teamUuid = values.teamUuid;
    if (values.kind === 'mark_zone') input.isPublic = values.isPublic;
    if (values.kind === 'hazardous_zone') {
      input.status = DEFAULT_HAZARD_STATUS;
      input.informationSource = values.informationSource.trim() || null;
    }

    if (
      holdDraft(draft, {
        message: `已建立${AREA_KIND_LABELS[values.kind]}「${input.name}」`,
        send: async (keepalive) => {
          const created = await createArea.mutateAsync({
            variables: { input },
            keepalive,
          });
          return created.createArea.uuid;
        },
      })
    )
      setEditor(null);
  };

  const editedArea = editing
    ? visibleAreas.find((area) => area.id === editing.areaId)
    : undefined;
  const editedItem = editing
    ? areaListItems.find((item) => item.id === editing.areaId)
    : undefined;
  const editCrosses = editing !== null && polygonSelfIntersects(editing.points);
  const editChange =
    editing && !ticketReadFailed
      ? boundaryChange(
          { polygons: [[editing.original]] },
          { polygons: [[editing.points]] },
          markers,
        )
      : null;
  const editChanged =
    editing !== null &&
    (editing.points.length !== editing.original.length ||
      editing.points.some(
        (point, index) =>
          point[0] !== editing.original[index][0] ||
          point[1] !== editing.original[index][1],
      ));
  const startBoundary = (areaId: string, points: Coordinates[]) =>
    setEditor({ kind: 'bounds', areaId, original: points, points });
  const changeBounds = useEventCallback((points: Coordinates[]) => {
    if (editing) setEditor({ ...editing, points });
  });
  const boundsOverlay = (
    editing
      ? { points: editing.points, invalid: editCrosses, onChange: changeBounds }
      : null
  ) satisfies RescueMapEditArea | null;

  const saveBoundary = () => {
    if (
      !editing ||
      !editedArea ||
      !editChanged ||
      editCrosses ||
      editing.points.length < 3
    )
      return;
    const { areaId, points } = editing;
    const name = editedArea.name ? `「${editedArea.name}」` : '這個區域';
    if (
      hold({
        uuid: areaId,
        change: { kind: 'geometry', polygons: [[points]] },
        message: `已調整${name}的範圍`,
        send: async (keepalive) => {
          await updateArea.mutateAsync({
            variables: {
              uuid: areaId,
              input: { geometry: toGeoJsonPolygon(points) },
            },
            keepalive,
          });
        },
      })
    ) {
      returnToList(areaId);
    }
  };

  return {
    draft: {
      state: draw,
      overlay: draftArea,
      contents: draftContents,
      tickets: draftTickets,
      crosses,
      canStart: heldDraft === null,
      hasRecoverable: recoverableDraft !== null,
      start: startDrawing,
      addCorner,
      undoCorner,
      finish: finishOutline,
      back: returnToOutline,
      submit: submitArea,
    },
    bounds: {
      state: editing,
      overlay: boundsOverlay,
      area: editedArea,
      item: editedItem,
      crosses: editCrosses,
      change: editChange,
      changed: editChanged,
      start: startBoundary,
      reset: () => {
        if (editing) changeBounds(editing.original);
      },
      save: saveBoundary,
    },
    updateArea,
  };
}
