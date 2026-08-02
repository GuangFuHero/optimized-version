'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  BASE_LAYER_CONFIG,
  DEFAULT_RESCUE_MAP_OVERLAY_LAYERS,
  OVERLAY_LAYER_CONFIG,
  RESCUE_MAP_INITIAL_VIEW,
  RESCUE_MAP_OVERLAY_LAYER_ORDER,
} from '../constants';
import { RESCUE_MAP_MARKERS } from '../mock-data';
import type {
  RescueMapBaseLayer,
  RescueMapBoundingBox,
  RescueMapControllerValue,
  RescueMapDataType,
  RescueMapLayerPreferences,
  RescueMapMarkerItem,
  RescueMapOverlayLayer,
  RescueMapRouteState,
} from '../types';
import { filterRescueMapMarkers } from '../utils/filter-markers';

interface TileAttributionResponse {
  attribution_text?: string;
  requires_logo?: boolean;
  logo_url?: string | null;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildAttributionMarkup(
  payload: TileAttributionResponse,
  fallback: string,
) {
  const text = payload.attribution_text?.trim();

  if (!text) {
    return fallback;
  }

  const escapedText = escapeHtml(text);

  if (!payload.requires_logo || !payload.logo_url) {
    return escapedText;
  }

  const escapedLogoUrl = escapeHtml(payload.logo_url);

  return [
    '<span style="display:inline-flex;align-items:center;gap:6px;">',
    `<img src="${escapedLogoUrl}" alt="" style="height:14px;width:auto;vertical-align:middle;" />`,
    `<span>${escapedText}</span>`,
    '</span>',
  ].join('');
}

interface RescueMapControllerOptions {
  /** 受控的路由狀態（前台由網址驅動）。 */
  routeState?: RescueMapRouteState;
  /** 受控模式下，UI 互動需寫回的回呼（前台用於更新網址）。 */
  onRouteStateChange?: (next: RescueMapRouteState) => void;
  /** 覆寫預設 marker 資料源。 */
  sourceMarkers?: readonly RescueMapMarkerItem[];
  closureAreas?: readonly import('../types').RescueMapClosureArea[];
  /** 是否用地圖疊加圖層開關過濾 marker。列表頁會關閉此行為。 */
  filterMarkersByOverlayLayers?: boolean;
  /**
   * 是否用目前 bbox 過濾 marker。地圖畫布會關閉此行為——視窗外的標記本就
   * 不可見，關閉後視角移動不會重建 markers 陣列；列表頁維持開啟。
   */
  filterMarkersByBbox?: boolean;
}

const EMPTY_ROUTE_STATE: RescueMapRouteState = {};
const MAP_LAYER_PREFERENCE_STORAGE_KEY = 'rescue-map:layer-preferences';

const FALLBACK_LAYER_PREFERENCES: Required<
  Pick<RescueMapLayerPreferences, 'enabledOverlayLayers'>
> = {
  enabledOverlayLayers: [...DEFAULT_RESCUE_MAP_OVERLAY_LAYERS],
};

function normalizeOverlayLayers(
  value: unknown,
  fallback: readonly RescueMapOverlayLayer[],
): RescueMapOverlayLayer[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  const values = new Set(value);

  return RESCUE_MAP_OVERLAY_LAYER_ORDER.filter((layer) => values.has(layer));
}

function normalizeLayerPreferences(value: unknown): RescueMapLayerPreferences {
  if (!value || typeof value !== 'object') {
    return FALLBACK_LAYER_PREFERENCES;
  }

  const candidate = value as Partial<RescueMapLayerPreferences>;
  const baseLayer =
    candidate.baseLayer &&
    candidate.baseLayer in BASE_LAYER_CONFIG &&
    !BASE_LAYER_CONFIG[candidate.baseLayer].hidden
      ? candidate.baseLayer
      : undefined;

  const enabledOverlayLayers = normalizeOverlayLayers(
    candidate.enabledOverlayLayers,
    FALLBACK_LAYER_PREFERENCES.enabledOverlayLayers,
  );

  return {
    baseLayer,
    enabledOverlayLayers: RESCUE_MAP_OVERLAY_LAYER_ORDER.filter((layer) =>
      enabledOverlayLayers.includes(layer),
    ),
  };
}

function readLayerPreferences(): RescueMapLayerPreferences {
  if (typeof window === 'undefined') {
    return FALLBACK_LAYER_PREFERENCES;
  }

  const storedValue = window.localStorage.getItem(
    MAP_LAYER_PREFERENCE_STORAGE_KEY,
  );

  if (!storedValue) {
    return FALLBACK_LAYER_PREFERENCES;
  }

  try {
    return normalizeLayerPreferences(JSON.parse(storedValue));
  } catch {
    return FALLBACK_LAYER_PREFERENCES;
  }
}

function writeLayerPreferences(preferences: RescueMapLayerPreferences) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    MAP_LAYER_PREFERENCE_STORAGE_KEY,
    JSON.stringify(preferences),
  );
}

export function useRescueMapController({
  routeState,
  onRouteStateChange,
  sourceMarkers = RESCUE_MAP_MARKERS,
  closureAreas: sourceClosureAreas = [],
  filterMarkersByOverlayLayers = true,
  filterMarkersByBbox = true,
}: RescueMapControllerOptions = {}): RescueMapControllerValue {
  // 受控（提供 onRouteStateChange）由外部網址驅動；
  // 非受控（後台）則退回內部狀態，維持既有行為。
  const isControlled = onRouteStateChange != null;
  const [internalState, setInternalState] =
    useState<RescueMapRouteState>(EMPTY_ROUTE_STATE);
  const [layerPreferences, setLayerPreferences] =
    useState<RescueMapLayerPreferences>(FALLBACK_LAYER_PREFERENCES);
  const [resolvedAttributions, setResolvedAttributions] = useState<
    Partial<Record<RescueMapBaseLayer, string>>
  >({});
  const state = isControlled
    ? (routeState ?? EMPTY_ROUTE_STATE)
    : internalState;
  const baseLayer: RescueMapBaseLayer =
    state.baseLayer ?? layerPreferences.baseLayer ?? 'osm-direct';

  useEffect(() => {
    setLayerPreferences(readLayerPreferences());
  }, []);

  useEffect(() => {
    const layerConfig = BASE_LAYER_CONFIG[baseLayer];

    if (!layerConfig?.attributionApiPath) {
      return;
    }

    let cancelled = false;

    void fetch(layerConfig.attributionApiPath, {
      cache: 'force-cache',
    })
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }

        return (await response.json()) as TileAttributionResponse;
      })
      .then((payload) => {
        if (cancelled || !payload) {
          return;
        }

        const nextAttribution = buildAttributionMarkup(
          payload,
          layerConfig.attribution,
        );

        setResolvedAttributions((current) =>
          current[baseLayer] === nextAttribution
            ? current
            : {
                ...current,
                [baseLayer]: nextAttribution,
              },
        );
      })
      .catch(() => {
        // Keep fallback attribution when attribution API is unavailable.
      });

    return () => {
      cancelled = true;
    };
  }, [baseLayer]);

  const updateLayerPreferences = useCallback(
    (
      updater: (
        current: RescueMapLayerPreferences,
      ) => RescueMapLayerPreferences,
    ) => {
      setLayerPreferences((current) => {
        const next = normalizeLayerPreferences(updater(current));
        writeLayerPreferences(next);
        return next;
      });
    },
    [],
  );

  const stateRef = useRef(state);
  stateRef.current = state;

  const commit = useCallback(
    (next: RescueMapRouteState) => {
      stateRef.current = next;

      if (isControlled) {
        onRouteStateChange(next);
        return;
      }

      setInternalState(next);
    },
    [isControlled, onRouteStateChange],
  );

  const [layerPanelOpen, setLayerPanelOpen] = useState(false);
  const openLayerPanel = useCallback(() => setLayerPanelOpen(true), []);
  const closeLayerPanel = useCallback(() => setLayerPanelOpen(false), []);

  const dataType = state.dataType;
  const subDataTypes = useMemo(
    () => state.subDataTypes ?? [],
    [state.subDataTypes],
  );
  const enabledOverlayLayers = useMemo(
    () =>
      normalizeOverlayLayers(
        layerPreferences.enabledOverlayLayers,
        FALLBACK_LAYER_PREFERENCES.enabledOverlayLayers,
      ),
    [layerPreferences.enabledOverlayLayers],
  );
  const enabledOverlayLayerSet = useMemo(
    () => new Set(enabledOverlayLayers),
    [enabledOverlayLayers],
  );
  const selectedMarkerId = state.selectedMarkerId;

  const setBaseLayer = useCallback(
    (layer: RescueMapBaseLayer) => {
      commit({ ...stateRef.current, baseLayer: layer });
      updateLayerPreferences((current) => ({ ...current, baseLayer: layer }));
    },
    [commit, updateLayerPreferences],
  );

  const toggleOverlayLayer = useCallback(
    (layer: RescueMapOverlayLayer) => {
      if (OVERLAY_LAYER_CONFIG[layer].disabledReason) {
        return;
      }

      updateLayerPreferences((current) => {
        const currentLayers = new Set(
          normalizeOverlayLayers(
            current.enabledOverlayLayers,
            FALLBACK_LAYER_PREFERENCES.enabledOverlayLayers,
          ),
        );

        if (currentLayers.has(layer)) {
          currentLayers.delete(layer);
        } else {
          currentLayers.add(layer);
        }

        return {
          ...current,
          enabledOverlayLayers: RESCUE_MAP_OVERLAY_LAYER_ORDER.filter(
            (candidate) => currentLayers.has(candidate),
          ),
        };
      });
    },
    [updateLayerPreferences],
  );

  const setDataType = useCallback(
    (nextDataType: RescueMapDataType) => {
      if (stateRef.current.dataType === nextDataType) {
        return;
      }

      // 切換維度時清除子分類與詳情，避免殘留另一維度的選取。
      commit({
        ...stateRef.current,
        dataType: nextDataType,
        subDataTypes: [],
        selectedMarkerId: undefined,
      });
    },
    [commit],
  );

  const toggleSubDataType = useCallback(
    (value: string) => {
      const current = new Set(stateRef.current.subDataTypes ?? []);

      if (current.has(value)) {
        current.delete(value);
      } else {
        current.add(value);
      }

      commit({ ...stateRef.current, subDataTypes: [...current] });
    },
    [commit],
  );

  const setSelectedMarkerId = useCallback(
    (markerId: string | undefined) => {
      commit({ ...stateRef.current, selectedMarkerId: markerId });
    },
    [commit],
  );

  const setViewportState = useCallback(
    (next: {
      center: [number, number];
      zoom: number;
      bbox: RescueMapBoundingBox;
    }) => {
      const current = stateRef.current;
      const currentPosition = current.position;
      const currentBbox = current.bbox;

      const positionUnchanged =
        currentPosition?.zoom === next.zoom &&
        currentPosition.center[0] === next.center[0] &&
        currentPosition.center[1] === next.center[1];
      const bboxUnchanged =
        currentBbox?.[0] === next.bbox[0] &&
        currentBbox?.[1] === next.bbox[1] &&
        currentBbox?.[2] === next.bbox[2] &&
        currentBbox?.[3] === next.bbox[3];

      if (positionUnchanged && bboxUnchanged) {
        return;
      }

      commit({
        ...current,
        position: {
          center: next.center,
          zoom: next.zoom,
        },
        bbox: next.bbox,
      });
    },
    [commit],
  );

  const tileLayer = useMemo(() => {
    const baseConfig = BASE_LAYER_CONFIG[baseLayer];
    const resolvedAttribution = resolvedAttributions[baseLayer];

    if (!resolvedAttribution || resolvedAttribution === baseConfig.attribution) {
      return baseConfig;
    }

    return {
      ...baseConfig,
      attribution: resolvedAttribution,
    };
  }, [baseLayer, resolvedAttributions]);
  // 只取用過濾真正需要的欄位；視角（position／bbox）提交不應重建 markers 陣列，
  // 否則地圖每次移動都會觸發下游 marker 圖層重新同步。
  const filterBbox = filterMarkersByBbox ? state.bbox : undefined;
  const markerFilterState = useMemo<RescueMapRouteState>(
    () => ({
      dataType: state.dataType,
      subDataTypes: state.subDataTypes,
      search: state.search,
      bbox: filterBbox,
    }),
    [filterBbox, state.dataType, state.search, state.subDataTypes],
  );
  const markers = useMemo(() => {
    return filterRescueMapMarkers(sourceMarkers, markerFilterState);
  }, [markerFilterState, sourceMarkers]);
  const closureAreas = useMemo(
    () =>
      enabledOverlayLayerSet.has('closure-areas')
        ? [...sourceClosureAreas]
        : [],
    [enabledOverlayLayerSet, sourceClosureAreas],
  );
  const overlayLayerMeta = useMemo(() => {
    return {
      'closure-areas': {
        itemCount: sourceClosureAreas.length,
        sourceLabel: 'closure_areas + base_geometries',
      },
      routes: {
        itemCount: 0,
        sourceLabel: 'routes + base_geometries',
      },
      'secondary-locations': {
        itemCount: 0,
        sourceLabel: 'secondary_locations + base_geometries',
      },
    } as const;
  }, [sourceClosureAreas.length]);
  const initialView = useMemo(
    () => ({
      center: state.position?.center ?? RESCUE_MAP_INITIAL_VIEW.center,
      zoom: state.position?.zoom ?? RESCUE_MAP_INITIAL_VIEW.zoom,
    }),
    [state.position],
  );

  return {
    baseLayer,
    setBaseLayer,
    dataType,
    setDataType,
    subDataTypes,
    toggleSubDataType,
    enabledOverlayLayers,
    toggleOverlayLayer,
    selectedMarkerId,
    setSelectedMarkerId,
    setViewportState,
    layerPanelOpen,
    openLayerPanel,
    closeLayerPanel,
    markers,
    closureAreas,
    overlayLayerMeta,
    tileLayer,
    initialView,
  };
}
