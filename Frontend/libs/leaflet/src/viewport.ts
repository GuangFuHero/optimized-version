// SPDX-License-Identifier: GPL-3.0-only
import type { Map } from 'leaflet';
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useSyncExternalStore,
} from 'react';
import { useMap } from './map-container.tsx';

export interface MapViewport {
  center: [latitude: number, longitude: number];
  zoom: number;
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface ViewportOptions {
  /** Delay reports until movement has paused for this many milliseconds. */
  settleMs?: number;
  /** Wrap the center's longitude to Leaflet's CRS range. Bounds stay unwrapped. */
  wrapLongitude?: boolean;
  /** Skip the synchronous opening report when false. Defaults to true. */
  reportInitial?: boolean;
  /** Sample the latest live view when the timer ends instead of the completed move. */
  sampleOnSettle?: boolean;
}

export function readMapViewport(map: Map, wrapLongitude = false): MapViewport {
  const center = map.getCenter();
  const { lat, lng } = wrapLongitude ? center.wrap() : center;
  const bounds = map.getBounds();
  return {
    center: [lat, lng],
    zoom: map.getZoom(),
    west: bounds.getWest(),
    south: bounds.getSouth(),
    east: bounds.getEast(),
    north: bounds.getNorth(),
  };
}

export function observeMapViewport(
  map: Map,
  onChange: (viewport: MapViewport) => void,
  {
    settleMs = 0,
    wrapLongitude = false,
    reportInitial = true,
    sampleOnSettle = false,
  }: ViewportOptions = {},
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const read = () => readMapViewport(map, wrapLongitude);
  const report = () => {
    if (settleMs <= 0) {
      onChange(read());
      return;
    }
    clearTimeout(timer);
    const latest = sampleOnSettle ? null : read();
    timer = setTimeout(() => onChange(latest ?? read()), settleMs);
  };

  // A zoom also ends with moveend.
  map.on('moveend', report);
  if (reportInitial) onChange(read());

  return () => {
    clearTimeout(timer);
    map.off('moveend', report);
  };
}

export interface ViewportObserverProps extends ViewportOptions {
  onChange: (viewport: MapViewport) => void;
}

export function ViewportObserver({
  onChange,
  settleMs,
  wrapLongitude,
  reportInitial,
  sampleOnSettle,
}: ViewportObserverProps) {
  const map = useMap();
  const report = useEffectEvent(onChange);
  useEffect(
    () =>
      observeMapViewport(map, (viewport) => report(viewport), {
        settleMs,
        wrapLongitude,
        reportInitial,
        sampleOnSettle,
      }),
    [map, reportInitial, sampleOnSettle, settleMs, wrapLongitude],
  );
  return null;
}

function createViewportStore(
  map: Map | null,
  settleMs?: number,
  wrapLongitude?: boolean,
) {
  let snapshot = map ? readMapViewport(map, wrapLongitude) : null;
  return {
    subscribe(notify: () => void) {
      if (!map) return () => undefined;
      return observeMapViewport(
        map,
        (viewport) => {
          snapshot = viewport;
          notify();
        },
        { settleMs, wrapLongitude },
      );
    },
    getSnapshot: () => snapshot,
  };
}

/** A settled snapshot of a map obtained through useMap or an existing Leaflet integration. */
export function useMapViewport(
  map: Map | null,
  {
    settleMs,
    wrapLongitude,
  }: Pick<ViewportOptions, 'settleMs' | 'wrapLongitude'> = {},
): MapViewport | null {
  const store = useMemo(
    () => createViewportStore(map, settleMs, wrapLongitude),
    [map, settleMs, wrapLongitude],
  );
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => null);
}

export function useMapZoom(map: Map | null): number | null {
  const subscribe = useCallback(
    (notify: () => void) => {
      map?.on('zoomend', notify);
      return () => {
        map?.off('zoomend', notify);
      };
    },
    [map],
  );
  return useSyncExternalStore(
    subscribe,
    () => map?.getZoom() ?? null,
    () => null,
  );
}
