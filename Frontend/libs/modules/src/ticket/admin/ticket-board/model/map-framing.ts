/** A point as the map takes it: [lat, lng]. */
export type MapPoint = readonly [number, number];

/** Where the map should go to show a set of points, or nothing when there is none. */
export type MapFraming =
  | { kind: 'none' }
  | { kind: 'point'; point: MapPoint }
  | { kind: 'bounds'; southWest: MapPoint; northEast: MapPoint };

/** One point is shown at a street zoom; several by the box around them. */
export function framingOf(points: readonly MapPoint[]): MapFraming {
  if (points.length === 0) return { kind: 'none' };
  const lats = points.map(([lat]) => lat);
  const lngs = points.map(([, lng]) => lng);
  const southWest: MapPoint = [Math.min(...lats), Math.min(...lngs)];
  const northEast: MapPoint = [Math.max(...lats), Math.max(...lngs)];
  if (southWest[0] === northEast[0] && southWest[1] === northEast[1]) {
    return { kind: 'point', point: southWest };
  }
  return { kind: 'bounds', southWest, northEast };
}

/**
 * What a framing load does to the map. Each request (a filter set, or a 顯示全部 press) moves it
 * once: later loads of the same request, such as a refetch after a write, leave the view alone.
 * While a ticket is open the map stays on it, and the request counts as done.
 */
export function framingStep(
  framedRequest: string | null,
  request: string,
  hasSelection: boolean,
): 'frame' | 'skip' | 'done' {
  if (framedRequest === request) return 'done';
  return hasSelection ? 'skip' : 'frame';
}

/**
 * Bringing the open ticket into view, decided once per ticket when its detail lands: go to its
 * point unless its pin is already among those on the map. Null while there is nothing to decide.
 */
export function selectedFocusStep(input: {
  selectedUuid: string | null;
  focusedUuid: string | null;
  loadedIds: ReadonlySet<string>;
  /** The open ticket's detail has loaded. */
  detailLoaded: boolean;
  point: MapPoint | null;
}): { point: MapPoint | null } | null {
  const { selectedUuid, focusedUuid, loadedIds, detailLoaded, point } = input;
  if (!selectedUuid || selectedUuid === focusedUuid || !detailLoaded) {
    return null;
  }
  return { point: loadedIds.has(selectedUuid) ? null : point };
}

export type TicketMapNotice = 'error' | 'zoom-in' | 'none-here' | null;

/**
 * What the map says above itself: a failed load, more tickets in view than it draws, or none in
 * view though some match elsewhere.
 */
export function ticketMapNotice(input: {
  failed: boolean;
  /** Matching tickets in view, null until the view's load lands. */
  inViewTotal: number | null;
  shown: number;
  /** Matching tickets anywhere, null until known. */
  matchingTotal: number | null;
}): TicketMapNotice {
  if (input.failed) return 'error';
  if (input.inViewTotal === null) return null;
  if (input.inViewTotal > input.shown) return 'zoom-in';
  if (input.inViewTotal === 0 && (input.matchingTotal ?? 0) > 0) {
    return 'none-here';
  }
  return null;
}
