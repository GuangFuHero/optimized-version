'use client';

import { createStore, useStore } from 'zustand';
import type { CreateAreaInput } from '@rescue-frontend/data-access/admin';
import type { RescueMapArea } from '../types';

export type AreaFormValues = {
  [K in
    | 'name'
    | 'note'
    | 'informationSource'
    | 'teamUuid'
    | 'isPublic']-?: NonNullable<CreateAreaInput[K]>;
} & { kind: CreateAreaInput['type'] | null };

export const EMPTY_AREA_FORM: AreaFormValues = {
  kind: null,
  name: '',
  note: '',
  informationSource: '',
  teamUuid: '',
  isPublic: false,
};

type Coordinates = RescueMapArea['polygons'][number][number][number];
export type DrawEditor = {
  kind: 'draw';
  step: 'drawing' | 'form';
  points: Coordinates[];
  values: AreaFormValues;
};

type AreaEditor =
  | DrawEditor
  | {
      kind: 'bounds';
      areaId: string;
      original: Coordinates[];
      points: Coordinates[];
    }
  | { kind: 'metadata'; areaId: string };

interface AreaView {
  selectedAreaId: string | null;
  lastChangedAreaId: string | null;
  editor: AreaEditor | null;
  selectArea: (id: string | null, highlight?: string | null) => void;
  highlightArea: (id: string | null) => void;
  setEditor: (editor: AreaEditor | null) => void;
  setMetadataEditing: (areaId: string, editing: boolean) => void;
}

export function createAdminAreaEditorStore() {
  return createStore<AreaView>((set) => ({
    selectedAreaId: null,
    lastChangedAreaId: null,
    editor: null,
    selectArea: (selectedAreaId, lastChangedAreaId = null) =>
      set({ selectedAreaId, lastChangedAreaId, editor: null }),
    highlightArea: (lastChangedAreaId) => set({ lastChangedAreaId }),
    setEditor: (editor) => set({ editor }),
    setMetadataEditing: (areaId, editing) =>
      set((state) => {
        if (state.selectedAreaId !== areaId) return state;
        if (editing) return { editor: { kind: 'metadata', areaId } };
        return state.editor?.kind === 'metadata' ? { editor: null } : state;
      }),
  }));
}

export function useAdminAreaEditor<T>(
  store: ReturnType<typeof createAdminAreaEditorStore>,
  select: (view: AreaView) => T,
) {
  return useStore(store, select);
}
