import { MAP_VIEW_TAIWAN } from './constants';
import type { RescueMapView } from './types';

/**
 * Where a map opens (prototype `wg-bridge.js` MAP-VIEW-101–104): at the view the event sets, else
 * all of Taiwan; and, for a map people browse, at the view this browser last left it at. The
 * location picker remembers nothing (prototype `tk-locpicker.jsx`, 49a668bd).
 *
 * As in the prototype, a view remembered stays when the event's view changes: only a browser that
 * has not opened the map yet opens at the event's view (the designer's rule, 2026-11-01).
 */

/** Each browsing map remembers a view of its own (prototype `wg.mapLast.<map>`). */
export type RescueMapMemoryKey = 'site' | 'mutual-aid' | 'station' | 'tickets';

/**
 * What the event says about where maps open: its view; `null` when it sets none, or no event is
 * configured yet; `undefined` when it could not be read.
 */
export type EventMapView = RescueMapView | null | undefined;

export interface MapOpening {
  view: RescueMapView;
  /** Opened where the map was left: a map that frames its data leaves the first framing out. */
  restored: boolean;
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

/**
 * Where the event says maps open, once it is known. `fresh`: not until a read made since the map
 * mounted has answered, or the wait for one has run out. An answer held from earlier in this tab is
 * not taken alone then: it may be from before the event's view was changed, and the map would open
 * where the event no longer says. Without `fresh`, an answer held is taken at once. A read that fails
 * keeps the answer held before it; with none, `eventView` is undefined, as for an event that could not
 * be read.
 */
export function settleEventMapView(read: {
  data: { currentDisaster?: CurrentDisasterMapView | null } | undefined;
  fresh: boolean;
  readSinceMount: boolean;
  waitedOut: boolean;
}): { ready: boolean; eventView: EventMapView } {
  const answered =
    read.readSinceMount || (!read.fresh && read.data !== undefined);

  if (!answered && !read.waitedOut) {
    return { ready: false, eventView: undefined };
  }

  return {
    ready: true,
    eventView: read.data
      ? toEventMapView(read.data.currentDisaster)
      : undefined,
  };
}

/** The view this browser left the map at, when there is one, whatever the event says now. */
export function resolveMapOpening(
  remembered: RescueMapView | null,
  eventView: EventMapView,
): MapOpening {
  return remembered
    ? { view: remembered, restored: true }
    : { view: eventView ?? MAP_VIEW_TAIWAN, restored: false };
}

/**
 * Whether a map remembers the view it opened at, as if it had been moved there: one that keeps its
 * position in the address (`remembersOpening`, the site's), opened at the event's own view. Not one
 * opened at a position in the address or where it was left. Nor when the event sets no view or could
 * not be read: all of Taiwan would then stay, though the event sets a view later.
 */
export function remembersOpeningView(opened: {
  remembersOpening: boolean;
  addressHasPosition: boolean;
  opening: MapOpening;
  eventView: EventMapView;
}): boolean {
  return (
    opened.remembersOpening &&
    !opened.addressHasPosition &&
    !opened.opening.restored &&
    Boolean(opened.eventView)
  );
}

function roundCoordinate(value: number) {
  return Math.round(value * 1e3) / 1e3;
}

/** What to remember of a view the map was left at. */
export function recordMapView(view: RescueMapView): RescueMapView {
  return {
    // About 100 m: enough to come back to the same view, not enough to show the next person on a
    // shared computer the very door the last one looked at. The prototype keeps about a metre.
    center: [roundCoordinate(view.center[0]), roundCoordinate(view.center[1])],
    zoom: view.zoom,
  };
}

/** A view remembered. One left before also holds the event view of the time, which no longer counts. */
export function parseRememberedMapView(value: unknown): RescueMapView | null {
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

// Reads and writes below fail quietly: a private window or blocked site data throws, and the map
// then just opens as on a first visit.

export function readRememberedMapView(
  key: RescueMapMemoryKey,
): RescueMapView | null {
  try {
    const stored = window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${key}`);

    return stored ? parseRememberedMapView(JSON.parse(stored)) : null;
  } catch {
    return null;
  }
}

export function rememberMapView(key: RescueMapMemoryKey, view: RescueMapView) {
  try {
    window.localStorage.setItem(
      `${STORAGE_KEY_PREFIX}${key}`,
      JSON.stringify(recordMapView(view)),
    );
  } catch {
    // Nothing remembered; see above.
  }
}
