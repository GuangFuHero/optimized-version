// SPDX-License-Identifier: GPL-3.0-only
import { createStore } from 'zustand/vanilla';
import type { RescueMapViewportStoreSnapshot } from './types';

export type MapViewportStore = ReturnType<typeof createMapViewportStore>;

export function createMapViewportStore(
  initialState: RescueMapViewportStoreSnapshot,
) {
  return createStore<RescueMapViewportStoreSnapshot>()(() => initialState);
}
