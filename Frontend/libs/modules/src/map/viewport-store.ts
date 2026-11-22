import { createStore } from 'zustand/vanilla';
import type { RescueMapViewportStoreSnapshot } from './types';

export type MapViewportStore = ReturnType<typeof createMapViewportStore>;

export function createMapViewportStore(
  initialState: RescueMapViewportStoreSnapshot,
) {
  return createStore<RescueMapViewportStoreSnapshot>()(() => initialState);
}
