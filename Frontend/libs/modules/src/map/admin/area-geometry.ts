import {
  boundsOfPolygons,
  pointInPolygon,
} from '@rescue-frontend/leaflet/geometry';
import type { RescueMapArea, RescueMapMarkerItem } from '../types';

type LatLng = [number, number];

/** Whether a point is inside the map's view, `[minLng, minLat, maxLng, maxLat]`. No view yet: no. */
export function isInView(
  [lat, lng]: LatLng,
  bbox: readonly [number, number, number, number] | null | undefined,
): boolean {
  if (!bbox) {
    return false;
  }

  const [minLng, minLat, maxLng, maxLat] = bbox;

  return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat;
}

export function isInArea(
  point: LatLng,
  area: Pick<RescueMapArea, 'polygons'>,
): boolean {
  return area.polygons.some((rings) => pointInPolygon(point, rings));
}

export interface AreaContents {
  tickets: number;
  stations: number;
}

/**
 * The tickets and stations among `markers` that fall inside an area. No API counts them, so the list
 * panel counts what the map has loaded: the markers in the current view, not all of the area's.
 * A ticket the viewer may not see exactly sits at the centre of its cell, and is counted there.
 */
export function countInsideArea(
  area: Pick<RescueMapArea, 'polygons'>,
  markers: readonly RescueMapMarkerItem[],
): AreaContents {
  const contents: AreaContents = { tickets: 0, stations: 0 };

  markers.forEach((marker) => {
    if (!isInArea(marker.position, area)) {
      return;
    }

    if (marker.detailType === 'ticket') {
      contents.tickets += 1;
    } else {
      contents.stations += 1;
    }
  });

  return contents;
}

export interface AreaView {
  center: LatLng;
  zoom: number;
  /** [minLng, minLat, maxLng, maxLat], as the map reports its own. */
  bbox: [number, number, number, number];
}

const MAX_ZOOM = 17;
const MIN_ZOOM = 5;
// How wide the map is taken to be when the caller does not know: a desktop's, less its side panel.
const DEFAULT_VIEW_WIDTH_PX = 760;
const TILE_PX = 256;
// Room round the area, as a share of its size.
const VIEW_PADDING = 1.25;

/**
 * Where the map looks to take in a whole area: its middle, and the zoom at which its width fits.
 * `widthPx` is the map's own width, which on a phone is the screen's. An area with no points has no
 * view.
 */
export function viewOfArea(
  area: Pick<RescueMapArea, 'polygons'>,
  widthPx: number = DEFAULT_VIEW_WIDTH_PX,
): AreaView | null {
  const bbox = boundsOfArea(area);
  if (!bbox) return null;

  const [minLng, minLat, maxLng, maxLat] = bbox;
  const lngSpan = Math.max((maxLng - minLng) * VIEW_PADDING, 0.0005);
  const zoom = Math.min(
    MAX_ZOOM,
    Math.max(
      MIN_ZOOM,
      Math.floor(Math.log2((360 * Math.max(widthPx, 1)) / (lngSpan * TILE_PX))),
    ),
  );

  return { center: [(minLat + maxLat) / 2, (minLng + maxLng) / 2], zoom, bbox };
}

export function boundsOfArea(
  area: Pick<RescueMapArea, 'polygons'>,
): AreaView['bbox'] | null {
  return boundsOfPolygons(area.polygons);
}

export interface BoundaryChange {
  /** Tickets inside the new boundary. */
  inside: number;
  /** Tickets the new boundary takes in, that the old one did not. */
  added: number;
  /** Tickets the new boundary leaves out, that the old one had. */
  removed: number;
}

/**
 * What changing a boundary does to the tickets among `markers` (MAP-ZD-195): how many are inside
 * afterwards, how many come in, how many go out. Counted separately, since what follows from one is
 * not what follows from the other.
 */
export function boundaryChange(
  before: Pick<RescueMapArea, 'polygons'>,
  after: Pick<RescueMapArea, 'polygons'>,
  markers: readonly RescueMapMarkerItem[],
): BoundaryChange {
  const change: BoundaryChange = { inside: 0, added: 0, removed: 0 };

  markers.forEach((marker) => {
    if (marker.detailType !== 'ticket') {
      return;
    }

    const wasInside = isInArea(marker.position, before);
    const isInside = isInArea(marker.position, after);

    if (isInside) {
      change.inside += 1;
    }

    if (isInside && !wasInside) {
      change.added += 1;
    }

    if (wasInside && !isInside) {
      change.removed += 1;
    }
  });

  return change;
}
