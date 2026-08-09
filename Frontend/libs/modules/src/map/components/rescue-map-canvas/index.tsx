'use client';

import L from 'leaflet';
import { useEffect, useRef, useSyncExternalStore } from 'react';

import type {
  RescueMapClosureArea,
  RescueMapControllerValue,
  RescueMapMarkerItem,
  RescueMapViewportStoreSnapshot,
  RescueMapViewportStoreLike,
} from '../../types';
import { createMapMarkerIcon } from '../map-marker';

interface RescueMapCanvasProps {
  controller: RescueMapControllerValue;
  onMarkerClick: (item: RescueMapMarkerItem) => void;
  previewMarker?: RescueMapMarkerItem | null;
  cursor?: string;
  onMapClick?: (position: [number, number]) => void;
  layoutKey: string;
  showScale?: boolean;
  viewportStore?: RescueMapViewportStoreLike;
}

/** moveend／zoomend 後延遲寫回路由狀態，把連續手勢合併成一次提交。 */
const VIEWPORT_SYNC_DEBOUNCE_MS = 250;
const MARKER_CLUSTER_MODULE_ID = 'react-leaflet-cluster';
const EMPTY_VIEWPORT_STATE: RescueMapViewportStoreSnapshot = {};

interface MarkerHandle {
  marker: L.Marker;
  item: RescueMapMarkerItem;
  iconSignature: string;
}

interface ClosureAreaHandle {
  layerGroup: L.LayerGroup;
  signature: string;
}

interface MarkerClusterGroupLike extends L.LayerGroup {
  addLayer(layer: L.Layer): this;
  removeLayer(layer: L.Layer): this;
}

type MarkerClusterFactory = (options: {
  animate: boolean;
  animateAddingMarkers: boolean;
  chunkedLoading: boolean;
  showCoverageOnHover: boolean;
  spiderfyOnMaxZoom: boolean;
  iconCreateFunction: (cluster: {
    getChildCount: () => number;
    getAllChildMarkers: () => Array<L.Marker & { __rescueDetailType?: string }>;
  }) => L.DivIcon;
}) => MarkerClusterGroupLike;

type MarkerClusterConstructor = new (options: {
  animate: boolean;
  animateAddingMarkers: boolean;
  chunkedLoading: boolean;
  showCoverageOnHover: boolean;
  spiderfyOnMaxZoom: boolean;
  iconCreateFunction: (cluster: {
    getChildCount: () => number;
    getAllChildMarkers: () => Array<L.Marker & { __rescueDetailType?: string }>;
  }) => L.DivIcon;
}) => MarkerClusterGroupLike;

/** marker icon 的外觀只由色調（detailType）、圖示（variant）與標籤文字決定。 */
function getMarkerIconSignature(item: RescueMapMarkerItem): string {
  return `${item.detailType}|${item.variant}|${item.label}`;
}

function resolveClusterTone(
  markers: Array<L.Marker & { __rescueDetailType?: string }>,
): 'station' | 'ticket' {
  const stationCount = markers.filter(
    (marker) => marker.__rescueDetailType === 'station',
  ).length;

  if (stationCount === 0) {
    return 'ticket';
  }

  if (stationCount === markers.length) {
    return 'station';
  }

  return stationCount >= markers.length / 2 ? 'station' : 'ticket';
}

function createClusterIcon({
  count,
  tone,
  leaflet,
}: {
  count: number;
  tone: 'station' | 'ticket';
  leaflet: typeof import('leaflet');
}): import('leaflet').DivIcon {
  const sizeClass = count < 10 ? 'small' : count < 100 ? 'medium' : 'large';
  const dimension =
    sizeClass === 'small' ? 42 : sizeClass === 'medium' ? 50 : 58;

  return leaflet.divIcon({
    className: 'map-marker-cluster-wrapper',
    html: [
      `<div class="map-marker-cluster map-marker-cluster--${tone} map-marker-cluster--${sizeClass}">`,
      `<span class="map-marker-cluster__count">${count}</span>`,
      '</div>',
    ].join(''),
    iconSize: [dimension, dimension],
    iconAnchor: [dimension / 2, dimension / 2],
  });
}

function getClosureAreaStyle(status: string) {
  const normalizedStatus = status.trim().toLowerCase();

  if (normalizedStatus === 'dangerous' || normalizedStatus === 'active') {
    return {
      color: '#c2410c',
      fillColor: '#f97316',
      fillOpacity: 0.18,
      opacity: 0.84,
      weight: 2,
      dashArray: '8 4',
    };
  }

  if (normalizedStatus === 'block') {
    return {
      color: '#b91c1c',
      fillColor: '#ef4444',
      fillOpacity: 0.14,
      opacity: 0.78,
      weight: 2,
      dashArray: '6 3',
    };
  }

  return {
    color: '#9a3412',
    fillColor: '#fdba74',
    fillOpacity: 0.12,
    opacity: 0.72,
    weight: 2,
    dashArray: '5 4',
  };
}

function renderClosureAreas(
  layerGroup: L.LayerGroup,
  closureAreas: readonly RescueMapClosureArea[],
) {
  closureAreas.forEach((area) => {
    area.polygons.forEach((polygon) => {
      L.polygon(polygon, getClosureAreaStyle(area.status)).addTo(layerGroup);
    });
  });
}

function getClosureAreaSignature(area: RescueMapClosureArea): string {
  let pointCount = 0;

  area.polygons.forEach((rings) => {
    rings.forEach((ring) => {
      pointCount += ring.length;
    });
  });

  return `${area.id}:${area.status}:${pointCount}`;
}

function renderClosureArea(
  layerGroup: L.LayerGroup,
  area: RescueMapClosureArea,
) {
  area.polygons.forEach((polygon) => {
    L.polygon(polygon, getClosureAreaStyle(area.status)).addTo(layerGroup);
  });
}

function syncClosureAreaLayer({
  overlayLayer,
  areas,
  handles,
}: {
  overlayLayer: L.LayerGroup;
  areas: readonly RescueMapClosureArea[];
  handles: Map<string, ClosureAreaHandle>;
}) {
  const nextIds = new Set(areas.map((area) => area.id));

  handles.forEach((handle, id) => {
    if (!nextIds.has(id)) {
      overlayLayer.removeLayer(handle.layerGroup);
      handles.delete(id);
    }
  });

  areas.forEach((area) => {
    const signature = getClosureAreaSignature(area);
    const existing = handles.get(area.id);

    if (!existing) {
      const layerGroup = L.layerGroup();
      renderClosureArea(layerGroup, area);
      overlayLayer.addLayer(layerGroup);
      handles.set(area.id, {
        layerGroup,
        signature,
      });
      return;
    }

    if (existing.signature === signature) {
      return;
    }

    existing.layerGroup.clearLayers();
    renderClosureArea(existing.layerGroup, area);
    existing.signature = signature;
  });
}

function subscribeViewportStoreNoop() {
  return () => {};
}

function getEmptyViewportState(): RescueMapViewportStoreSnapshot {
  return EMPTY_VIEWPORT_STATE;
}

function syncViewportStateToController(
  map: L.Map,
  controller: RescueMapControllerValue,
) {
  const center = map.getCenter();
  const bounds = map.getBounds();

  controller.setViewportState({
    center: [center.lat, center.lng],
    zoom: map.getZoom(),
    bbox: [
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth(),
    ],
  });
}

function syncMarkerLayer({
  markerLayer,
  items,
  handles,
  leaflet,
  onMarkerClickRef,
}: {
  markerLayer: MarkerClusterGroupLike;
  items: readonly RescueMapMarkerItem[];
  handles: Map<string, MarkerHandle>;
  leaflet: typeof import('leaflet');
  onMarkerClickRef: React.MutableRefObject<(item: RescueMapMarkerItem) => void>;
}) {
  const nextIds = new Set(items.map((item) => item.id));

  handles.forEach((handle, id) => {
    if (!nextIds.has(id)) {
      markerLayer.removeLayer(handle.marker);
      handles.delete(id);
    }
  });

  items.forEach((item) => {
    const iconSignature = getMarkerIconSignature(item);
    const existing = handles.get(item.id);

    if (!existing) {
      const marker = L.marker(item.position, {
        icon: createMapMarkerIcon(item, leaflet),
      }) as L.Marker & { __rescueDetailType?: string };
      marker.__rescueDetailType = item.detailType;

      marker.on('click', () => {
        const handle = handles.get(item.id);
        onMarkerClickRef.current(handle?.item ?? item);
      });

      markerLayer.addLayer(marker);
      handles.set(item.id, { marker, item, iconSignature });
      return;
    }

    if (
      existing.item.position[0] !== item.position[0] ||
      existing.item.position[1] !== item.position[1]
    ) {
      existing.marker.setLatLng(item.position);
    }

    if (existing.iconSignature !== iconSignature) {
      existing.marker.setIcon(createMapMarkerIcon(item, leaflet));
      existing.iconSignature = iconSignature;
    }

    (
      existing.marker as L.Marker & { __rescueDetailType?: string }
    ).__rescueDetailType = item.detailType;

    existing.item = item;
  });
}

export function RescueMapCanvas({
  controller,
  onMarkerClick,
  previewMarker,
  cursor,
  onMapClick,
  layoutKey,
  showScale = false,
  viewportStore,
}: RescueMapCanvasProps) {
  const externalViewportState =
    useSyncExternalStore<RescueMapViewportStoreSnapshot>(
      viewportStore?.subscribe ?? subscribeViewportStoreNoop,
      viewportStore?.getSnapshot ?? getEmptyViewportState,
      viewportStore?.getSnapshot ?? getEmptyViewportState,
    );
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const scaleControlRef = useRef<L.Control.Scale | null>(null);
  const markerLayerRef = useRef<MarkerClusterGroupLike | null>(null);
  const overlayLayerRef = useRef<L.LayerGroup | null>(null);
  const previewMarkerRef = useRef<L.Marker | null>(null);
  const markerHandlesRef = useRef<Map<string, MarkerHandle>>(new Map());
  const closureAreaHandlesRef = useRef<Map<string, ClosureAreaHandle>>(
    new Map(),
  );
  const controllerRef = useRef(controller);
  const onMapClickRef = useRef(onMapClick);
  const onMarkerClickRef = useRef(onMarkerClick);
  const initialViewportStateRef = useRef(externalViewportState);

  controllerRef.current = controller;
  onMapClickRef.current = onMapClick;
  onMarkerClickRef.current = onMarkerClick;

  // 地圖實例整個生命週期只建立一次；受控的視角變化由下方 setView 效果套用，
  // 避免位置寫回路由狀態後反過來把整張地圖銷毀重建。
  useEffect(() => {
    const host = hostRef.current;

    if (!host || mapRef.current) {
      return;
    }

    const initialViewportState = initialViewportStateRef.current;
    const initialView = initialViewportState.position
      ? {
          center: initialViewportState.position.center,
          zoom:
            initialViewportState.position.zoom ??
            controllerRef.current.initialView.zoom,
        }
      : controllerRef.current.initialView;
    const map = L.map(host, {
      zoomControl: true,
      minZoom: 7,
      maxZoom: 18,
      center: initialView.center,
      zoom: initialView.zoom,
    });

    // 移除 Leaflet 預設 attribution 前綴的旗標圖示，與地圖內容無關。
    map.attributionControl.setPrefix(false);

    const overlayLayer = L.layerGroup();
    const markerHandles = markerHandlesRef.current;
    let cancelled = false;

    mapRef.current = map;
    overlayLayerRef.current = overlayLayer;

    overlayLayer.addTo(map);

    void import(MARKER_CLUSTER_MODULE_ID).then(() => {
      if (cancelled || !mapRef.current) {
        return;
      }

      const clusterCtor = (
        L as typeof L & {
          MarkerClusterGroup?: MarkerClusterConstructor;
          markerClusterGroup?: MarkerClusterFactory;
        }
      ).MarkerClusterGroup;
      const clusterFactory = (
        L as typeof L & {
          MarkerClusterGroup?: MarkerClusterConstructor;
          markerClusterGroup?: MarkerClusterFactory;
        }
      ).markerClusterGroup;

      const markerLayer =
        clusterFactory?.({
          animate: false,
          animateAddingMarkers: false,
          chunkedLoading: true,
          showCoverageOnHover: false,
          spiderfyOnMaxZoom: true,
          iconCreateFunction: (cluster) =>
            createClusterIcon({
              count: cluster.getChildCount(),
              tone: resolveClusterTone(cluster.getAllChildMarkers()),
              leaflet: L,
            }),
        }) ??
        (clusterCtor
          ? new clusterCtor({
              animate: false,
              animateAddingMarkers: false,
              chunkedLoading: true,
              showCoverageOnHover: false,
              spiderfyOnMaxZoom: true,
              iconCreateFunction: (cluster) =>
                createClusterIcon({
                  count: cluster.getChildCount(),
                  tone: resolveClusterTone(cluster.getAllChildMarkers()),
                  leaflet: L,
                }),
            })
          : null);

      if (!markerLayer) {
        return;
      }

      markerLayer.addTo(mapRef.current);
      markerLayerRef.current = markerLayer;
      syncMarkerLayer({
        markerLayer,
        items: controllerRef.current.markers,
        handles: markerHandles,
        leaflet: L,
        onMarkerClickRef,
      });
    });

    let viewportSyncTimer: number | undefined;

    const syncViewport = () => {
      const currentMap = mapRef.current;

      if (!currentMap) {
        return;
      }

      syncViewportStateToController(currentMap, controllerRef.current);
    };

    const scheduleViewportSync = () => {
      window.clearTimeout(viewportSyncTimer);
      viewportSyncTimer = window.setTimeout(
        syncViewport,
        VIEWPORT_SYNC_DEBOUNCE_MS,
      );
    };

    const handleMapClick = (event: L.LeafletMouseEvent) => {
      onMapClickRef.current?.([event.latlng.lat, event.latlng.lng]);
    };

    map.on('moveend', scheduleViewportSync);
    map.on('zoomend', scheduleViewportSync);
    map.on('click', handleMapClick);

    const resizeObserver = new ResizeObserver(() => {
      try {
        map.invalidateSize({ animate: false });
      } catch {
        // Ignore resize races while the map is being torn down.
      }
    });

    resizeObserver.observe(host);
    window.requestAnimationFrame(() => {
      try {
        map.invalidateSize({ animate: false });
        syncViewport();
      } catch {
        // Ignore initial invalidation race during client mount.
      }
    });

    return () => {
      window.clearTimeout(viewportSyncTimer);
      resizeObserver.disconnect();
      map.off('moveend', scheduleViewportSync);
      map.off('zoomend', scheduleViewportSync);
      map.off('click', handleMapClick);
      cancelled = true;

      markerHandles.clear();
      closureAreaHandlesRef.current.clear();
      markerLayerRef.current = null;
      overlayLayerRef.current = null;
      previewMarkerRef.current = null;
      tileLayerRef.current = null;
      scaleControlRef.current = null;
      mapRef.current = null;

      map.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    const currentCenter = map.getCenter();
    const currentZoom = map.getZoom();
    const [nextLat, nextLng] =
      externalViewportState.position?.center ?? controller.initialView.center;
    const nextZoom =
      externalViewportState.position?.zoom ?? controller.initialView.zoom;

    if (
      currentZoom === nextZoom &&
      currentCenter.lat === nextLat &&
      currentCenter.lng === nextLng
    ) {
      return;
    }

    try {
      map.setView([nextLat, nextLng], nextZoom, { animate: false });
      syncViewportStateToController(map, controllerRef.current);
    } catch {
      // Ignore map view races during rapid controlled updates.
    }
  }, [
    controller.initialView.center,
    controller.initialView.zoom,
    externalViewportState.position,
  ]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    try {
      map.invalidateSize({ animate: false });
    } catch {
      // Ignore resize races triggered by detail drawer layout changes.
    }
  }, [layoutKey]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    map.getContainer().style.cursor = cursor ?? 'grab';
  }, [cursor]);

  useEffect(() => {
    const map = mapRef.current;
    const currentTileLayer = tileLayerRef.current;
    const nextTileLayer = controller.tileLayer;

    if (!map) {
      return;
    }

    if (currentTileLayer) {
      currentTileLayer.remove();
      tileLayerRef.current = null;
    }

    if (!nextTileLayer?.url || !nextTileLayer?.attribution) {
      return;
    }

    const tileLayer = L.tileLayer(nextTileLayer.url, {
      attribution: nextTileLayer.attribution,
    });

    tileLayer.addTo(map);
    tileLayerRef.current = tileLayer;
  }, [controller.tileLayer]);

  useEffect(() => {
    const map = mapRef.current;
    const currentControl = scaleControlRef.current;

    if (!map) {
      return;
    }

    if (currentControl) {
      currentControl.remove();
      scaleControlRef.current = null;
    }

    if (!showScale) {
      return;
    }

    const scaleControl = L.control.scale({
      position: 'bottomleft',
      metric: true,
      imperial: false,
      maxWidth: 120,
    });

    scaleControl.addTo(map);
    scaleControlRef.current = scaleControl;
  }, [showScale]);

  // 以 id 增量同步 marker：只移除消失的、加入新增的，內容相同時不動 DOM，
  // 避免每次資料刷新都整批 clearLayers 再重建造成閃爍。
  useEffect(() => {
    const markerLayer = markerLayerRef.current;

    if (!markerLayer) {
      return;
    }

    syncMarkerLayer({
      markerLayer,
      items: controller.markers,
      handles: markerHandlesRef.current,
      leaflet: L,
      onMarkerClickRef,
    });
  }, [controller.markers]);

  useEffect(() => {
    const overlayLayer = overlayLayerRef.current;

    if (!overlayLayer) {
      return;
    }

    syncClosureAreaLayer({
      overlayLayer,
      areas: controller.closureAreas,
      handles: closureAreaHandlesRef.current,
    });
  }, [controller.closureAreas]);

  useEffect(() => {
    const map = mapRef.current;
    const currentPreviewMarker = previewMarkerRef.current;

    if (!map) {
      return;
    }

    if (currentPreviewMarker) {
      currentPreviewMarker.remove();
      previewMarkerRef.current = null;
    }

    if (!previewMarker) {
      return;
    }

    const marker = L.marker(previewMarker.position, {
      icon: createMapMarkerIcon(previewMarker, L),
      interactive: false,
    });

    marker.addTo(map);
    previewMarkerRef.current = marker;
  }, [previewMarker]);

  return <div ref={hostRef} style={{ width: '100%', height: '100%' }} />;
}
