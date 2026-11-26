// SPDX-License-Identifier: GPL-3.0-only
'use client';

import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import type { MapViewportStore } from '../viewport-store';
import type { RescueMapViewportStoreSnapshot } from '../types';

export const SiteMapViewportStoreContext =
  createContext<MapViewportStore | null>(null);

export function useSiteMapViewportStore(): MapViewportStore {
  const context = useContext(SiteMapViewportStoreContext);

  if (!context) {
    throw new Error(
      'useSiteMapViewportStore must be used within SiteMapViewportStoreContext',
    );
  }

  return context;
}

export function useSiteMapViewportState(): RescueMapViewportStoreSnapshot {
  const store = useSiteMapViewportStore();

  return useStore(store);
}
