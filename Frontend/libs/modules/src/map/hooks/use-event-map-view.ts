'use client';

import { useEffect, useMemo, useState } from 'react';

import { useCurrentDisaster } from '@rescue-frontend/data-access/admin';

import { MAP_VIEW_TAIWAN } from '../constants';
import {
  forgetMapView,
  readRememberedMapView,
  resolveMapOpening,
  toEventMapView,
  type EventMapView,
  type MapOpening,
  type RescueMapMemoryKey,
} from '../map-opening';
import type { RescueMapView } from '../types';

export interface EventMapViewState {
  /** False while the event is being read. */
  ready: boolean;
  eventView: EventMapView;
  /**
   * The event's view, else all of Taiwan (MAP-VIEW-101, 102): where a map with nothing else to go
   * on opens.
   */
  view: RescueMapView;
}

const READING: EventMapViewState = {
  ready: false,
  eventView: undefined,
  view: MAP_VIEW_TAIWAN,
};

/**
 * Where the event says maps open (`currentDisaster.mapView`, ADR-395). An event that sets no view,
 * no event configured yet and a failed read all come to all of Taiwan; only the last leaves
 * `eventView` undefined.
 */
export function useEventMapView(): EventMapViewState {
  const { data, status } = useCurrentDisaster();

  return useMemo(() => {
    // A read that fails after one that worked keeps the answer it had.
    if (data) {
      const eventView = toEventMapView(data.currentDisaster);

      return { ready: true, eventView, view: eventView ?? MAP_VIEW_TAIWAN };
    }

    return status === 'error'
      ? { ready: true, eventView: undefined, view: MAP_VIEW_TAIWAN }
      : READING;
  }, [data, status]);
}

/**
 * Where a map opens, worked out once (`resolveMapOpening`); null until then. A position in the
 * address is not waited on: the map opens there at once, and this only settles what it falls back
 * to. Otherwise it waits for the event, which says whether the view the map was left at still holds.
 */
export function useMapOpening({
  memoryKey,
  addressHasPosition,
}: {
  memoryKey?: RescueMapMemoryKey;
  addressHasPosition: boolean;
}): { opening: MapOpening | null; eventView: EventMapView } {
  const event = useEventMapView();
  const [opening, setOpening] = useState<MapOpening | null>(null);

  useEffect(() => {
    if (opening || !event.ready) {
      return;
    }

    const next =
      memoryKey && !addressHasPosition
        ? resolveMapOpening(readRememberedMapView(memoryKey), event.eventView)
        : resolveMapOpening(null, event.eventView);

    if (memoryKey && next.dropRemembered) {
      forgetMapView(memoryKey);
    }

    setOpening(next);
  }, [addressHasPosition, event, memoryKey, opening]);

  return { opening, eventView: event.eventView };
}
