import {
  SITE_BASE_LAYERS,
  SITE_DATA_TYPES,
  SITE_FALLBACK_BASE_LAYER,
  SITE_FALLBACK_DATA_TYPE,
  normalizeSiteSubDataTypes,
} from './constants';
import type {
  RescueMapBaseLayer,
  RescueMapDataType,
  SiteModule,
  SiteRouteState,
} from './types';

/** 提供 `get(name)` 的查詢字串來源，相容 URLSearchParams 與 Next.js 的唯讀版本。 */
export interface SiteQuerySource {
  get(name: string): string | null;
}

function decodeSegment(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseBaseLayer(
  value: string | undefined,
): RescueMapBaseLayer | undefined {
  const decoded = decodeSegment(value);

  if (!decoded) {
    return undefined;
  }

  if (SITE_BASE_LAYERS.includes(decoded as RescueMapBaseLayer)) {
    return decoded as RescueMapBaseLayer;
  }

  return SITE_FALLBACK_BASE_LAYER;
}

function parseDataType(value: string | undefined): RescueMapDataType {
  const decoded = decodeSegment(value);

  if (decoded && SITE_DATA_TYPES.includes(decoded as RescueMapDataType)) {
    return decoded as RescueMapDataType;
  }

  return SITE_FALLBACK_DATA_TYPE;
}

function parseSubDataTypes(value: string | undefined): string[] {
  return (decodeSegment(value) ?? '')
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function isViewportSegment(value: string | undefined): boolean {
  return Boolean(value?.startsWith('@') && value.endsWith('z'));
}

function splitCompactViewportSegment(value: string | undefined): {
  segment: string | undefined;
  viewportSegment: string | undefined;
} {
  if (!value) {
    return { segment: undefined, viewportSegment: undefined };
  }

  const markerIndex = value.indexOf('@');

  if (markerIndex <= 0 || !value.endsWith('z')) {
    return { segment: value, viewportSegment: undefined };
  }

  return {
    segment: value.slice(0, markerIndex) || undefined,
    viewportSegment: value.slice(markerIndex),
  };
}

function parseNumberTuple(
  value: string | null,
  expectedLength: number,
): number[] | undefined {
  const values = (value ?? '')
    .replace(/[{}]/g, '')
    .split(',')
    .map((part) => Number(part.trim()));

  if (
    values.length !== expectedLength ||
    values.some((number) => !Number.isFinite(number))
  ) {
    return undefined;
  }

  return values;
}

function parseBbox(value: string | null): SiteRouteState['bbox'] {
  const values = parseNumberTuple(value, 4);

  if (!values) {
    return undefined;
  }

  const [minLng, minLat, maxLng, maxLat] = values;

  if (minLng >= maxLng || minLat >= maxLat) {
    return undefined;
  }

  return [minLng, minLat, maxLng, maxLat];
}

function parsePosition(value: string | null): SiteRouteState['position'] {
  const values = parseNumberTuple(value, 3);

  if (!values) {
    return undefined;
  }

  const [lat, lng, zoom] = values;

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return undefined;
  }

  return {
    center: [lat, lng],
    zoom: Math.min(18, Math.max(9, Math.round(zoom))),
  };
}

function parsePositionSegment(
  value: string | undefined,
): SiteRouteState['position'] {
  if (!isViewportSegment(value)) {
    return undefined;
  }

  const raw = value?.slice(1, -1) ?? '';
  const values = raw.split(',').map((part) => Number(part.trim()));

  if (
    values.length !== 3 ||
    values.some((number) => !Number.isFinite(number))
  ) {
    return undefined;
  }

  const [lat, lng, zoom] = values;

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return undefined;
  }

  return {
    center: [lat, lng],
    zoom: Math.min(18, Math.max(9, zoom)),
  };
}

function derivePositionFromBbox(
  bbox: SiteRouteState['bbox'],
): SiteRouteState['position'] {
  if (!bbox) {
    return undefined;
  }

  const [minLng, minLat, maxLng, maxLat] = bbox;

  return {
    center: [(minLat + maxLat) / 2, (minLng + maxLng) / 2],
  };
}

/**
 * 解析前台路由片段與查詢字串為共用的 {@link SiteRouteState}。
 *
 * - `map` 片段：`[baseLayer, dataType, subDataTypes]`
 * - `list` 片段：`[dataType, subDataTypes]`
 */
export function parseSiteRouteState(
  module: SiteModule,
  segments: readonly string[],
  query: SiteQuerySource,
): SiteRouteState {
  const lastSegment = segments[segments.length - 1];
  const compactViewport =
    module === 'map' ? splitCompactViewportSegment(lastSegment) : undefined;
  const viewportSegment =
    module === 'map'
      ? isViewportSegment(lastSegment)
        ? lastSegment
        : compactViewport?.viewportSegment
      : undefined;
  const routeSegments =
    viewportSegment && compactViewport?.viewportSegment
      ? [...segments.slice(0, -1), compactViewport.segment].filter(Boolean)
      : viewportSegment
        ? segments.slice(0, -1)
        : [...segments];
  const [baseLayerSegment, dataTypeSegment, subDataTypeSegment] =
    module === 'map'
      ? routeSegments
      : ([undefined, routeSegments[0], routeSegments[1]] as const);

  const search = query.get('search')?.trim();
  const bbox = parseBbox(query.get('bbox'));
  const positionFromSegment = parsePositionSegment(viewportSegment);
  const positionFromQuery = parsePosition(query.get('pos'));
  const dataType = parseDataType(dataTypeSegment);

  return {
    baseLayer: parseBaseLayer(baseLayerSegment),
    dataType,
    subDataTypes: normalizeSiteSubDataTypes(
      dataType,
      parseSubDataTypes(subDataTypeSegment),
    ),
    selectedMarkerId: query.get('id') ?? undefined,
    bbox,
    position:
      positionFromSegment ??
      positionFromQuery ??
      derivePositionFromBbox(bbox),
    search: search || undefined,
  };
}
