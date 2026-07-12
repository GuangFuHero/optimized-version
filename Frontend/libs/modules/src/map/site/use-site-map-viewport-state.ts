'use client';

import { createContext, useContext, useSyncExternalStore } from 'react';

import type { SiteRouteState } from '../../route/types';

export type SiteMapViewportState = Pick<SiteRouteState, 'position' | 'bbox'>;

export interface SiteMapViewportStore {
  getSnapshot: () => SiteMapViewportState;
  setState: (next: SiteMapViewportState) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createSiteMapViewportStore(
  initialState: SiteMapViewportState,
): SiteMapViewportStore {
  let snapshot = initialState;
  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => snapshot,
    setState: (next) => {
      const unchanged =
        snapshot.position?.zoom === next.position?.zoom &&
        snapshot.position?.center[0] === next.position?.center[0] &&
        snapshot.position?.center[1] === next.position?.center[1] &&
        snapshot.bbox?.[0] === next.bbox?.[0] &&
        snapshot.bbox?.[1] === next.bbox?.[1] &&
        snapshot.bbox?.[2] === next.bbox?.[2] &&
        snapshot.bbox?.[3] === next.bbox?.[3];

      if (unchanged) {
        return;
      }

      snapshot = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const SiteMapViewportStoreContext =
  createContext<SiteMapViewportStore | null>(null);

export function useSiteMapViewportStore(): SiteMapViewportStore {
  const context = useContext(SiteMapViewportStoreContext);

  if (!context) {
    throw new Error(
      'useSiteMapViewportStore must be used within SiteMapViewportStoreContext',
    );
  }

  return context;
}

export function useSiteMapViewportState(): SiteMapViewportState {
  const store = useSiteMapViewportStore();

  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}
