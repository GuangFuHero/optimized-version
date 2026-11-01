'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import {
  CURRENT_DISASTER_WAIT_MS,
  currentDisasterQuery,
} from '@rescue-frontend/data-access/admin';

import { MAP_VIEW_TAIWAN } from '../constants';
import {
  forgetMapView,
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

interface DecidedOpening {
  opening: MapOpening;
  openedUnder: EventMapView;
}

/**
 * Where a map opens, worked out once (`resolveMapOpening`); null until then. A position in the
 * address is not waited on: the map opens there at once, and this only settles what it falls back
 * to. Otherwise it waits for the event, which says whether the view the map was left at still holds.
 * An address naming the view this browser left is passed as no position (`addressHasPosition`
 * false): it is that view, and is waited on like it.
 *
 * `openedUnder` is the event view the opening was worked out under, kept as it was: a view the map
 * is left at is remembered under it. The live one would let an event view changed while the map is
 * open pass for the one it was left under, and the next visit would come back to the old view
 * instead of going to the new event view. Undefined until the opening is worked out.
 *
 * `eventView` is the live one, for a map opened under an event that could not be read: with nothing
 * remembered, a view it is left at is remembered under the event view once that arrives.
 */
export function useMapOpening({
  memoryKey,
  addressHasPosition,
}: {
  memoryKey?: RescueMapMemoryKey;
  addressHasPosition: boolean;
}): {
  opening: MapOpening | null;
  openedUnder: EventMapView;
  eventView: EventMapView;
} {
  const event = useEventMapView();
  const [decided, setDecided] = useState<DecidedOpening | null>(null);

  useEffect(() => {
    if (decided || !event.ready) {
      return;
    }

    const opening =
      memoryKey && !addressHasPosition
        ? resolveMapOpening(readRememberedMapView(memoryKey), event.eventView)
        : resolveMapOpening(null, event.eventView);

    if (memoryKey && opening.dropRemembered) {
      forgetMapView(memoryKey);
    }

    // Opened at the event's view, it is remembered as the view left, as if the map had been moved
    // there: the address then names it, and a reload after the event's view changes finds it is the
    // one this browser left (`isRememberedView`) and goes to the new one. Not one from the address.
    if (memoryKey && !addressHasPosition && !opening.restored) {
      rememberMapView(memoryKey, opening.view, event.eventView);
    }

    setDecided({ opening, openedUnder: event.eventView });
  }, [addressHasPosition, decided, event, memoryKey]);

  return {
    opening: decided?.opening ?? null,
    openedUnder: decided?.openedUnder,
    eventView: event.eventView,
  };
}
