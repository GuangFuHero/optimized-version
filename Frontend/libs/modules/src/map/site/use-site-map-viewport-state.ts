'use client';

import { createContext, useContext } from 'react';
import { createStore, useStore } from 'zustand';

import type { SiteRouteState } from '../../route/types';

export type SiteMapViewportState = Pick<SiteRouteState, 'position' | 'bbox'>;

export type SiteMapViewportStore = ReturnType<
  typeof createSiteMapViewportStore
>;

export function createSiteMapViewportStore(initialState: SiteMapViewportState) {
  return createStore<SiteMapViewportState>()(() => initialState);
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

  return useStore(store);
}
