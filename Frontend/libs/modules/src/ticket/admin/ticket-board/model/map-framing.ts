/** A point as the map takes it: [lat, lng]. */
export type MapPoint = readonly [number, number];

/** Where the map should go to show a set of points, or nothing when there is none. */
export type MapFraming =
  | { kind: 'none' }
  | { kind: 'point'; point: MapPoint }
  | { kind: 'bounds'; southWest: MapPoint; northEast: MapPoint };

/** The box `ticketsExtent` hands back around every matching ticket's point. */
export interface TicketExtent {
  count: number;
  minLat?: number | null;
  maxLat?: number | null;
  minLng?: number | null;
  maxLng?: number | null;
}

/** One point is shown at a street zoom; several by the box around them; none leaves the view. */
export function framingOf(extent: TicketExtent): MapFraming {
  const { count, minLat, maxLat, minLng, maxLng } = extent;
  if (
    count === 0 ||
    minLat == null ||
    maxLat == null ||
    minLng == null ||
    maxLng == null
  ) {
    return { kind: 'none' };
  }
  const southWest: MapPoint = [minLat, minLng];
  const northEast: MapPoint = [maxLat, maxLng];
  if (minLat === maxLat && minLng === maxLng) {
    return { kind: 'point', point: southWest };
  }
  return { kind: 'bounds', southWest, northEast };
}

/**
 * What a framing load does to the map. Each request (a filter set, or a 顯示全部 press) moves it
 * once: later loads of the same request, such as a refetch after a write, leave the view alone.
 * While a ticket is open the map stays on it, and the request counts as done. So does the first
 * request when the map opened where this browser left it (`openedWhereLeft`), as on the station
 * map: only the next filter set, or 顯示全部, frames.
 */
export function framingStep(
  framedRequest: string | null,
  request: string,
  hasSelection: boolean,
  openedWhereLeft = false,
): 'frame' | 'skip' | 'done' {
  if (framedRequest === request) return 'done';
  if (framedRequest === null && openedWhereLeft) return 'skip';
  return hasSelection ? 'skip' : 'frame';
}

/** The board map's height, in pixels: with the padding below, what a box must fit inside. */
export const TICKET_MAP_HEIGHT = 560;
/** What `fitBounds` keeps clear around a framed box, each side, in pixels. */
export const TICKET_MAP_FIT_PADDING = 48;

/** A point's place in pixels at `zoom`, as Leaflet's Web Mercator (EPSG:3857) puts it. */
function mercatorPixel([lat, lng]: MapPoint, zoom: number) {
  const scale = 256 * 2 ** zoom;
  const sin = Math.sin((lat * Math.PI) / 180);
  return {
    x: (scale * (lng + 180)) / 360,
    y: scale * (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)),
  };
}

/**
 * Whether a map of `size` shows the whole box at `zoom`, its widest, inside the padding `fitBounds`
 * keeps. Leaflet fits a wider one at that zoom anyway, around the box's middle (`framingMove`).
 */
export function boxFitsWhole(
  { southWest, northEast }: { southWest: MapPoint; northEast: MapPoint },
  size: { x: number; y: number },
  zoom: number,
): boolean {
  const sw = mercatorPixel(southWest, zoom);
  const ne = mercatorPixel(northEast, zoom);
  const room = 2 * TICKET_MAP_FIT_PADDING;
  return ne.x - sw.x <= size.x - room && sw.y - ne.y <= size.y - room;
}

/**
 * 有 N 張單在這個範圍外: after a framing that went home, the matching tickets the view leaves out,
 * which no one browsing the map would see. Null after any other framing, while a count is not in, or
 * with none left out.
 */
export function outsideCount(input: {
  wentHome: boolean;
  /** Matching tickets in view, null until the view's load lands. */
  inViewTotal: number | null;
  /** Matching tickets anywhere, null until known. */
  matchingTotal: number | null;
}): number | null {
  const { wentHome, inViewTotal, matchingTotal } = input;
  if (!wentHome || inViewTotal === null || matchingTotal === null) return null;
  const outside = matchingTotal - inViewTotal;
  return outside > 0 ? outside : null;
}

/**
 * What a decided framing request does: move the map, then load the view once it settles there;
 * or keep the view (an open ticket, no match, no box) and load the current view straight away.
 *
 * A box the map cannot show whole even at its widest zoom (`fits`) — one ticket far from the rest,
 * say — would be fitted at that zoom around the box's middle, which can be the open sea between
 * them. The map goes to the event's view, where maps open by default, instead: not to where it
 * opened, which may be where it was left.
 */
export function framingMove(
  step: 'frame' | 'skip',
  extent: TicketExtent,
  fits: (box: Extract<MapFraming, { kind: 'bounds' }>) => boolean = () => true,
):
  | { kind: 'stay' }
  | { kind: 'home' }
  | { kind: 'move'; framing: Exclude<MapFraming, { kind: 'none' }> } {
  const framing = step === 'frame' ? framingOf(extent) : null;
  if (!framing || framing.kind === 'none') return { kind: 'stay' };
  if (framing.kind === 'bounds' && !fits(framing)) return { kind: 'home' };
  return { kind: 'move', framing };
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

export type TicketMapNotice =
  | 'error'
  | 'zoom-in'
  | 'none-here'
  | 'empty'
  | null;

/**
 * What the map says above itself: a failed load, more tickets in view than it draws, or none in
 * view though some match elsewhere. With none matching anywhere it says so over the map
 * (`tk-map.jsx`'s empty state). Not none in view after a framing that went home: 顯示全部 would
 * frame the same box and go home again, and `outsideCount` says where they are.
 */
export function ticketMapNotice(input: {
  failed: boolean;
  /** Matching tickets in view, null until the view's load lands. */
  inViewTotal: number | null;
  shown: number;
  /** Matching tickets anywhere, null until known. */
  matchingTotal: number | null;
  /** The last framing went home, its box too wide to show. */
  wentHome?: boolean;
}): TicketMapNotice {
  if (input.failed) return 'error';
  if (input.inViewTotal === null) return null;
  if (input.inViewTotal > input.shown) return 'zoom-in';
  if (input.inViewTotal === 0 && input.matchingTotal === 0) return 'empty';
  if (
    input.inViewTotal === 0 &&
    (input.matchingTotal ?? 0) > 0 &&
    !input.wentHome
  ) {
    return 'none-here';
  }
  return null;
}
