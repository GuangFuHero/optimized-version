'use client';

import L from 'leaflet';
import { useEffect, useRef, useSyncExternalStore } from 'react';

import {
  buildLocationCells,
  isCoarseTicket,
  locationCellBoundary,
} from '../../location-cells';
import type {
  RescueMapClosureArea,
  RescueMapControllerValue,
  RescueMapLocationCell,
  RescueMapMarkerItem,
  RescueMapViewportStoreSnapshot,
  RescueMapViewportStoreLike,
} from '../../types';
import { createMapMarkerIcon } from '../map-marker';

import { designTokens } from '@rescue-frontend/ui';

const { color, primitives } = designTokens;

interface RescueMapCanvasProps {
  controller: RescueMapControllerValue;
  onMarkerClick: (item: RescueMapMarkerItem) => void;
  /** 點選訪客的概略區塊（ADR-281）。未提供時格子只畫不接點擊。 */
  onLocationCellClick?: (cell: RescueMapLocationCell) => void;
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

/**
 * 畫成圖釘的：站點與精確座標的任務單。概略座標的單（`locationCell`）改由格子層畫 ——
 * 它們都落在格子中心，當圖釘會整疊壓在同一點，也會讓人以為那就是地點。
 */
function getPinnedMarkers(
  markers: readonly RescueMapMarkerItem[],
): RescueMapMarkerItem[] {
  return markers.filter((marker) => !isCoarseTicket(marker));
}

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
      color: color.fg.warning,
      fillColor: color.bg.warning.default,
      fillOpacity: 0.18,
      opacity: 0.84,
      weight: 2,
      dashArray: '8 4',
    };
  }

  if (normalizedStatus === 'block') {
    return {
      color: color.fg.danger,
      fillColor: color.bg.danger.default,
      fillOpacity: 0.14,
      opacity: 0.78,
      weight: 2,
      dashArray: '6 3',
    };
  }

  return {
    color: color.brand.primary.subtle,
    fillColor: primitives.color.orange[200],
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

/** Unsubscribe handle for the no-op store. Named so the empty body reads as deliberate. */
function unsubscribeNoop() {
  // Nothing was subscribed, so there is nothing to tear down.
}

function subscribeViewportStoreNoop() {
  return unsubscribeNoop;
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

/**
 * 格子的填色：一般用深一階的橘（orange-600），裡面有急件就用 danger。
 *
 * 設計 2026-09-18（`origin/sucrelindesign` site-map.jsx）量過的數字：白字壓在淺色底圖上，
 * orange-400 @0.72 只有 2.29:1，orange-600 @0.90 才到 4.90:1（WCAG AA）。字上不加描邊或
 * 陰影 —— 讀不清楚時要調的是這裡的不透明度（PUB-PS-126）。語意層沒有「更深的 primary」，
 * 所以直接取 primitive。
 */
function getLocationCellFill(cell: RescueMapLocationCell): string {
  return cell.variant === 'urgent-ticket'
    ? color.bg.danger.default
    : primitives.color.orange[600];
}

function createLocationCellLabelIcon(
  cell: RescueMapLocationCell,
  selected: boolean,
): L.DivIcon {
  return L.divIcon({
    className: 'map-location-cell-wrapper',
    html: [
      `<div class="map-location-cell${selected ? ' map-location-cell--active' : ''}">`,
      `<span class="map-location-cell__count">${cell.members.length}</span>`,
      '<span class="map-location-cell__unit">求助</span>',
      '</div>',
    ].join(''),
    // 罩得住放大後的字，否則 Leaflet 會裁掉。
    iconSize: [104, 34],
    iconAnchor: [52, 17],
  });
}

function getLocationCellLayerSignature(
  cells: readonly RescueMapLocationCell[],
  selectedId: string | undefined,
): string {
  return cells
    .map(
      (cell) =>
        `${cell.id}:${cell.members.length}:${cell.variant}:${cell.id === selectedId ? 1 : 0}`,
    )
    .join('|');
}

/**
 * 訪客的概略區塊：六角形本身 ＋ 中央的數量。整層重畫 —— 格子數量少，而簽章相同時整個跳過，
 * 不會每次資料刷新都閃爍。選取狀態由六角形自己表達（線變粗、底色變深），數字不換色。
 */
function syncLocationCellLayer({
  cellLayer,
  cells,
  selectedId,
  onCellClickRef,
}: {
  cellLayer: L.LayerGroup;
  cells: readonly RescueMapLocationCell[];
  selectedId: string | undefined;
  onCellClickRef: React.MutableRefObject<
    ((cell: RescueMapLocationCell) => void) | undefined
  >;
}) {
  cellLayer.clearLayers();

  cells.forEach((cell) => {
    const selected = cell.id === selectedId;
    const fill = getLocationCellFill(cell);
    const onClick = () => onCellClickRef.current?.(cell);

    L.polygon(locationCellBoundary(cell.cell), {
      color: fill,
      weight: selected ? 4 : 2,
      fillColor: fill,
      fillOpacity: selected ? 0.96 : 0.9,
    })
      .on('click', onClick)
      .addTo(cellLayer);

    L.marker(cell.position, {
      icon: createLocationCellLabelIcon(cell, selected),
      title: `${cell.members.length} 筆求助（概略區塊）`,
      keyboard: true,
    })
      .on('click', onClick)
      .addTo(cellLayer);
  });
}

export function RescueMapCanvas({
  controller,
  onMarkerClick,
  onLocationCellClick,
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
  const cellLayerRef = useRef<L.LayerGroup | null>(null);
  const cellLayerSignatureRef = useRef<string | null>(null);
  const previewMarkerRef = useRef<L.Marker | null>(null);
  const markerHandlesRef = useRef<Map<string, MarkerHandle>>(new Map());
  const closureAreaHandlesRef = useRef<Map<string, ClosureAreaHandle>>(
    new Map(),
  );
  const controllerRef = useRef(controller);
  const onMapClickRef = useRef(onMapClick);
  const onMarkerClickRef = useRef(onMarkerClick);
  const onLocationCellClickRef = useRef(onLocationCellClick);
  const initialViewportStateRef = useRef(externalViewportState);

  controllerRef.current = controller;
  onMapClickRef.current = onMapClick;
  onMarkerClickRef.current = onMarkerClick;
  onLocationCellClickRef.current = onLocationCellClick;

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
    const cellLayer = L.layerGroup();
    const markerHandles = markerHandlesRef.current;
    let cancelled = false;

    mapRef.current = map;
    overlayLayerRef.current = overlayLayer;
    cellLayerRef.current = cellLayer;

    overlayLayer.addTo(map);
    // Drawn by the cell effect below, which runs after this one in the same commit.
    cellLayer.addTo(map);

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
        items: getPinnedMarkers(controllerRef.current.markers),
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
      cellLayerRef.current = null;
      cellLayerSignatureRef.current = null;
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
      items: getPinnedMarkers(controller.markers),
      handles: markerHandlesRef.current,
      leaflet: L,
      onMarkerClickRef,
    });
  }, [controller.markers]);

  useEffect(() => {
    const cellLayer = cellLayerRef.current;

    if (!cellLayer) {
      return;
    }

    const cells = buildLocationCells(controller.markers);
    const signature = getLocationCellLayerSignature(
      cells,
      controller.selectedMarkerId,
    );

    if (signature === cellLayerSignatureRef.current) {
      return;
    }

    cellLayerSignatureRef.current = signature;
    syncLocationCellLayer({
      cellLayer,
      cells,
      selectedId: controller.selectedMarkerId,
      onCellClickRef: onLocationCellClickRef,
    });
  }, [controller.markers, controller.selectedMarkerId]);

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
