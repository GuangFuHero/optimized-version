'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import {
  CURRENT_DISASTER_WAIT_MS,
  currentDisasterQuery,
} from '@rescue-frontend/data-access/admin';

import { MAP_VIEW_TAIWAN } from '../constants';
import {
  readRememberedMapView,
  rememberMapView,
  resolveMapOpening,
  settleEventMapView,
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

/**
 * Where the event says maps open (`currentDisaster.mapView`, ADR-395). An event that sets no view,
 * no event configured yet and a failed read all come to all of Taiwan; only the last leaves
 * `eventView` undefined, and so does a read still out after CURRENT_DISASTER_WAIT_MS. It is read
 * again on every mount and waited on (`settleEventMapView`): the answer this tab holds may be from
 * before the view was changed in the back office. An answer that comes later is taken, but a map
 * already open does not move to it.
 */
export function useEventMapView(): EventMapViewState {
  const { data, isFetchedAfterMount } = useQuery({
    ...currentDisasterQuery(),
    refetchOnMount: 'always',
  });
  const [waitedOut, setWaitedOut] = useState(false);

  useEffect(() => {
    if (isFetchedAfterMount) {
      return;
    }

    const timer = window.setTimeout(
      () => setWaitedOut(true),
      CURRENT_DISASTER_WAIT_MS,
    );

    return () => window.clearTimeout(timer);
  }, [isFetchedAfterMount]);

  return useMemo(() => {
    const { ready, eventView } = settleEventMapView({
      data,
      readSinceMount: isFetchedAfterMount,
      waitedOut,
    });

    return { ready, eventView, view: eventView ?? MAP_VIEW_TAIWAN };
  }, [data, isFetchedAfterMount, waitedOut]);
}

/**
 * Where a map opens, worked out once (`resolveMapOpening`); null until then. A position in the
 * address is not waited on: the map opens there at once, and this only settles what it falls back
 * to. Nor is a view this browser left the map at, which is where it opens whatever the event says.
 * Otherwise it waits for the event's view.
 *
 * Opened at the event's view, a map that keeps its position in the address (`remembersOpening`, the
 * site's) remembers it as the view left, as if it had been moved there: from then on this browser
 * comes back to it, though the event's view changes. A back-office map frames its data on a first
 * visit instead, and one that framed nothing would come back unframed. Nothing is remembered when the
 * event could not be read either: all of Taiwan would then stay.
 */
export function useMapOpening({
  memoryKey,
  addressHasPosition,
  remembersOpening = false,
}: {
  memoryKey?: RescueMapMemoryKey;
  addressHasPosition: boolean;
  remembersOpening?: boolean;
}): MapOpening | null {
  const event = useEventMapView();
  const [opening, setOpening] = useState<MapOpening | null>(null);

  useEffect(() => {
    if (opening) {
      return;
    }

    const remembered =
      memoryKey && !addressHasPosition
        ? readRememberedMapView(memoryKey)
        : null;

    if (!remembered && !event.ready) {
      return;
    }

    const decided = resolveMapOpening(remembered, event.eventView);

    if (
      memoryKey &&
      remembersOpening &&
      !addressHasPosition &&
      !decided.restored &&
      event.eventView !== undefined
    ) {
      rememberMapView(memoryKey, decided.view);
    }

    setOpening(decided);
  }, [addressHasPosition, event, memoryKey, opening, remembersOpening]);

  return opening;
}
