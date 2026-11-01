import { MAP_VIEW_TAIWAN } from './constants';
import type { RescueMapView } from './types';

/**
 * Where a map opens (prototype `wg-bridge.js` MAP-VIEW-101–104): at the view the event sets, else
 * all of Taiwan; and, for a map people browse, at the view this browser last left it at. The
 * location picker remembers nothing (prototype `tk-locpicker.jsx`, 49a668bd).
 *
 * Unlike the prototype, the remembered view carries the event view it was left under, and a changed
 * event view drops it: someone who moved the map before the event's view was set opens at it once it
 * is (user's decision, 2026-10-26).
 */

/** Each browsing map remembers a view of its own (prototype `wg.mapLast.<map>`). */
export type RescueMapMemoryKey = 'site' | 'mutual-aid' | 'station' | 'tickets';

/**
 * What the event says about where maps open: its view; `null` when it sets none, or no event is
 * configured yet; `undefined` when it could not be read.
 */
export type EventMapView = RescueMapView | null | undefined;

/** The view a map was left at, and the event view at the time. */
export interface RememberedMapView extends RescueMapView {
  eventView: RescueMapView | null;
}

export interface MapOpening {
  view: RescueMapView;
  /** Opened where the map was left: a map that frames its data leaves the first framing out. */
  restored: boolean;
  /** The remembered view was left under an event view since changed, and goes. */
  dropRemembered: boolean;
}

interface CurrentDisasterMapView {
  mapView?: { lat: number; lng: number; zoom: number } | null;
}

const STORAGE_KEY_PREFIX = 'rescue-map:last-view:';

export function toEventMapView(
  currentDisaster: CurrentDisasterMapView | null | undefined,
): RescueMapView | null {
  const mapView = currentDisaster?.mapView;

  return mapView
    ? { center: [mapView.lat, mapView.lng], zoom: mapView.zoom }
    : null;
}

/** Two unset views are the same: an event that still sets none has not changed. */
export function sameMapView(
  a: RescueMapView | null,
  b: RescueMapView | null,
): boolean {
  if (!a || !b) {
    return a === b;
  }

  return (
    a.zoom === b.zoom &&
    a.center[0] === b.center[0] &&
    a.center[1] === b.center[1]
  );
}

export function resolveMapOpening(
  remembered: RememberedMapView | null,
  eventView: EventMapView,
): MapOpening {
  const eventOpening = eventView ?? MAP_VIEW_TAIWAN;

  if (!remembered) {
    return { view: eventOpening, restored: false, dropRemembered: false };
  }

  // An event that could not be read has not changed for all anyone knows.
  if (eventView === undefined || sameMapView(remembered.eventView, eventView)) {
    return {
      view: { center: remembered.center, zoom: remembered.zoom },
      restored: true,
      dropRemembered: false,
    };
  }

  return { view: eventOpening, restored: false, dropRemembered: true };
}

function roundCoordinate(value: number) {
  return Math.round(value * 1e3) / 1e3;
}

/**
 * What to remember of a view the map was left at. A map opened under an event that could not be read
 * keeps the event view already remembered, or a failed read would pass for a changed event next time.
 * With none to keep, the event view read since then stands in (`eventViewSince`), so a first visit on
 * a slow connection is remembered once the event arrives; with neither, nothing is remembered.
 */
export function recordMapView(
  view: RescueMapView,
  eventView: EventMapView,
  remembered: RememberedMapView | null,
  eventViewSince: EventMapView = undefined,
): RememberedMapView | null {
  const leftUnder =
    eventView !== undefined
      ? eventView
      : remembered
        ? remembered.eventView
        : eventViewSince;

  if (leftUnder === undefined) {
    return null;
  }

  return {
    // About 100 m: enough to come back to the same view, not enough to show the next person on a
    // shared computer the very door the last one looked at. The prototype keeps about a metre.
    center: [roundCoordinate(view.center[0]), roundCoordinate(view.center[1])],
    zoom: view.zoom,
    eventView: leftUnder,
  };
}

function parseMapView(value: unknown): RescueMapView | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const { center, zoom } = value as Partial<RescueMapView>;

  if (
    !Array.isArray(center) ||
    center.length !== 2 ||
    !center.every(Number.isFinite) ||
    !Number.isFinite(zoom)
  ) {
    return null;
  }

  return { center: [center[0], center[1]], zoom: zoom as number };
}

export function parseRememberedMapView(
  value: unknown,
): RememberedMapView | null {
  const view = parseMapView(value);

  if (!view) {
    return null;
  }

  const { eventView } = value as { eventView?: unknown };
  const leftUnder = eventView === null ? null : parseMapView(eventView);

  if (eventView !== null && !leftUnder) {
    return null;
  }

  return { ...view, eventView: leftUnder };
}

// Reads and writes below fail quietly: a private window or blocked site data throws, and the map
// then just opens as on a first visit.

export function readRememberedMapView(
  key: RescueMapMemoryKey,
): RememberedMapView | null {
  try {
    const stored = window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${key}`);

    return stored ? parseRememberedMapView(JSON.parse(stored)) : null;
  } catch {
    return null;
  }
}

export function rememberMapView(
  key: RescueMapMemoryKey,
  view: RescueMapView,
  eventView: EventMapView,
  eventViewSince?: EventMapView,
) {
  try {
    const record = recordMapView(
      view,
      eventView,
      readRememberedMapView(key),
      eventViewSince,
    );

    if (record) {
      window.localStorage.setItem(
        `${STORAGE_KEY_PREFIX}${key}`,
        JSON.stringify(record),
      );
    }
  } catch {
    // Nothing remembered; see above.
  }
}

export function forgetMapView(key: RescueMapMemoryKey) {
  try {
    window.localStorage.removeItem(`${STORAGE_KEY_PREFIX}${key}`);
  } catch {
    // Nothing to forget, as nothing could be remembered; see above.
  }
}
