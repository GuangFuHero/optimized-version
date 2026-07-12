import {
  SITE_FALLBACK_BASE_LAYER,
  SITE_FALLBACK_DATA_TYPE,
  normalizeSiteSubDataTypes,
} from './constants';
import type { SiteModule, SiteRouteState } from './types';

function formatViewportSegment(state: SiteRouteState): string | null {
  const position = state.position;
  const zoom = position?.zoom;

  if (!position || typeof zoom !== 'number' || !Number.isFinite(zoom)) {
    return null;
  }

  const [lat, lng] = position.center;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  const normalizedZoom = Number(zoom.toFixed(2))
    .toString()
    .replace(/\.0+$/, '')
    .replace(/(\.\d*?)0+$/, '$1');

  return `@${lat.toFixed(7)},${lng.toFixed(7)},${normalizedZoom}z`;
}

function buildQueryString(state: SiteRouteState): string {
  const params: string[] = [];

  if (state.selectedMarkerId) {
    params.push(`id=${encodeURIComponent(state.selectedMarkerId)}`);
  }

  if (state.search) {
    params.push(`search=${encodeURIComponent(state.search)}`);
  }

  return params.length > 0 ? `?${params.join('&')}` : '';
}

/**
 * 將共用路由狀態序列化為前台網址，作為 UI → 網址 的單一來源。
 *
 * - `map` → `/map/{baseLayer}/{dataType}[/{subDataTypes}][/@{lat},{lng},{zoom}z]?{query}`
 * - `list` → `/list/{dataType}[/{subDataTypes}]?{query}`
 */
export function createSiteHref(
  module: SiteModule,
  state: SiteRouteState,
): string {
  const dataType = state.dataType ?? SITE_FALLBACK_DATA_TYPE;
  const subDataTypes = normalizeSiteSubDataTypes(
    dataType,
    state.subDataTypes ?? [],
  );
  const subSegment =
    subDataTypes.length > 0 ? `/${subDataTypes.join(',')}` : '';
  const viewportSegment =
    module === 'map'
      ? (() => {
          const formattedViewport = formatViewportSegment(state);
          return formattedViewport ? `/${formattedViewport}` : '';
        })()
      : '';

  const pathSegments =
    module === 'map'
      ? `/map/${state.baseLayer ?? SITE_FALLBACK_BASE_LAYER}/${dataType}${subSegment}${viewportSegment}`
      : `/list/${dataType}${subSegment}`;

  return `${pathSegments}${buildQueryString(state)}`;
}
