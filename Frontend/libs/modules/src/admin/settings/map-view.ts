import type { ProjectSettings } from '@rescue-frontend/data-access/admin';

import {
  MAP_VIEW_MAX_ZOOM,
  MAP_VIEW_MIN_ZOOM,
  MAP_VIEW_TAIWAN,
} from '../../map/constants';

export type MapView = NonNullable<ProjectSettings['map_view']>;

/** Under this, two centres are the same place on the small map (prototype `st-app.jsx` `same`). */
const SAME_CENTER_TOLERANCE = 1e-4;

/**
 * What the small map shows, as it is saved. The backend refuses a zoom that is not a whole 7 to 18,
 * so it is rounded and held there whatever the map reports. The centre keeps 5 decimals, about a
 * metre (prototype `st-app.jsx`).
 */
export function mapViewFromMap(view: MapView): MapView {
  return {
    lat: Number(view.lat.toFixed(5)),
    lng: Number(view.lng.toFixed(5)),
    zoom: Math.min(
      MAP_VIEW_MAX_ZOOM,
      Math.max(MAP_VIEW_MIN_ZOOM, Math.round(view.zoom)),
    ),
  };
}

export function sameMapView(a: MapView | null, b: MapView | null): boolean {
  if (!a || !b) return false;
  return (
    Math.abs(a.lat - b.lat) < SAME_CENTER_TOLERANCE &&
    Math.abs(a.lng - b.lng) < SAME_CENTER_TOLERANCE &&
    a.zoom === b.zoom
  );
}

/** Unset, the small map opens on all of Taiwan, as every map then does (MAP-VIEW-102). */
export function initialMapView(saved: MapView | null | undefined): MapView {
  if (saved) return saved;
  const [lat, lng] = MAP_VIEW_TAIWAN.center;
  return { lat, lng, zoom: MAP_VIEW_TAIWAN.zoom };
}

/** The PATCH body: the view whole to set it, null to clear it. Nothing else rides along. */
export function mapViewBody(view: MapView | null) {
  return { map_view: view };
}
