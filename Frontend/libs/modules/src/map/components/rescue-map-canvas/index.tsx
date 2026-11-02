'use client';

import L from 'leaflet';
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import {
  areaKind,
  areaLabelOpensPopup,
  areaLabelText,
  areaPopupLines,
  areaSignature,
  areaTitle,
  largestAreasFirst,
  placeAreaLabels,
  type ScreenBox,
} from '../../areas';
import { PUBLIC_ZONE_COLORS } from '../../constants';
import {
  isCoarseTicket,
  locationCellBoundary,
  locationCellLabelFit,
} from '../../location-cells';
import type {
  RescueMapArea,
  RescueMapClusterAppearance,
  RescueMapControllerValue,
  RescueMapDraftPoint,
  RescueMapLocationCell,
  RescueMapMarkerItem,
  RescueMapPublicZone,
  RescueMapView,
  RescueMapViewportStoreSnapshot,
  RescueMapViewportStoreLike,
} from '../../types';
import { createMapMarkerIcon, createMapMarkerTooltipHtml } from '../map-marker';

import { designTokens } from '@rescue-frontend/ui';

const { color, primitives } = designTokens;

interface RescueMapCanvasProps {
  controller: RescueMapControllerValue;
  onMarkerClick: (item: RescueMapMarkerItem) => void;
  /** 訪客的概略區塊（ADR-281），由 `Map` 決定：從 markers 分組，或後端每格的筆數。 */
  locationCells: readonly RescueMapLocationCell[];
  /** 點選訪客的概略區塊（ADR-281）。未提供時格子只畫不接點擊。 */
  onLocationCellClick?: (cell: RescueMapLocationCell) => void;
  previewMarker?: RescueMapMarkerItem | null;
  cursor?: string;
  onMapClick?: (position: [number, number]) => void;
  layoutKey: string;
  showScale?: boolean;
  viewportStore?: RescueMapViewportStoreLike;
  /** Marked by a crosshair that drags — see `Map`'s prop of the same name. */
  draftPoint?: RescueMapDraftPoint | null;
  /** The crosshair dragged to a new point, or let go (`null`) as the map is moved by hand. */
  onDraftPointChange?: (point: RescueMapDraftPoint | null) => void;
  /** Floats above the crosshair and goes where it goes. */
  draftPointAction?: ReactNode;
  /** Cluster look; read once, when the map is built. Default: the site's gradient discs. */
  clusterAppearance?: RescueMapClusterAppearance;
  /**
   * Highest zoom at which markers still cluster; read once, when the map is built. Default: they
   * cluster at every zoom.
   */
  clusterMaxZoom?: number;
  /** Where Leaflet's zoom buttons sit; read once. The `Map` decides whether they show. */
  zoomControlPosition?: L.ControlPosition;
  /** Hands the Leaflet map over once it is built, for callers that steer it themselves. */
  onMapReady?: (map: L.Map) => void;
  /** Where the map came to rest after it moved — see `Map`'s `viewMemoryKey`. */
  onViewChange?: (view: RescueMapView) => void;
}

/**
 * The crosshair of a picked point: 26px to see, 44px to grab with a gloved thumb (prototype
 * `createCrosshairIcon`, `site-map.jsx:73-95`). White under the stroke, to read on any basemap.
 */
function createDraftPointIcon(): L.DivIcon {
  const stroke = color.bg.primary.default;
  const halo = color.bg.neutral.default;
  const ring = (colour: string, width: number) =>
    `<circle cx="22" cy="22" r="13" fill="none" stroke="${colour}" stroke-width="${width}"/>`;
  const ticks = (colour: string, width: number) =>
    [
      [22, 2, 22, 13],
      [22, 31, 22, 42],
      [2, 22, 13, 22],
      [31, 22, 42, 22],
    ]
      .map(
        ([x1, y1, x2, y2]) =>
          `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${colour}" stroke-width="${width}"/>`,
      )
      .join('');

  return L.divIcon({
    className: '',
    html: `<div style="cursor:grab;line-height:0"><svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">${ring(halo, 4)}${ticks(halo, 4)}${ring(stroke, 2)}${ticks(stroke, 2)}</svg></div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

/** moveend／zoomend 後延遲寫回路由狀態，把連續手勢合併成一次提交。 */
const VIEWPORT_SYNC_DEBOUNCE_MS = 250;
/** Adds `L.markerClusterGroup` to the global `L` that `leaflet` set, which is why it loads after it. */
const MARKER_CLUSTER_MODULE_ID = 'leaflet.markercluster';
const EMPTY_VIEWPORT_STATE: RescueMapViewportStoreSnapshot = {};

interface MarkerHandle {
  marker: L.Marker;
  item: RescueMapMarkerItem;
  iconSignature: string;
}

interface AreaLabel {
  shape: L.Polygon;
  marker: L.Marker;
  element: HTMLElement;
  hazard: boolean;
}

interface AreaHandle {
  layerGroup: L.FeatureGroup;
  labels: AreaLabel[];
  signature: string;
}

interface MarkerClusterGroupLike extends L.LayerGroup {
  addLayer(layer: L.Layer): this;
  removeLayer(layer: L.Layer): this;
}

interface MarkerClusterOptions {
  animate: boolean;
  animateAddingMarkers: boolean;
  chunkedLoading: boolean;
  showCoverageOnHover: boolean;
  spiderfyOnMaxZoom: boolean;
  disableClusteringAtZoom?: number;
  iconCreateFunction: (cluster: {
    getChildCount: () => number;
    getAllChildMarkers: () => Array<L.Marker & { __rescueDetailType?: string }>;
  }) => L.DivIcon;
}

type MarkerClusterFactory = (
  options: MarkerClusterOptions,
) => MarkerClusterGroupLike;

type MarkerClusterConstructor = new (
  options: MarkerClusterOptions,
) => MarkerClusterGroupLike;

/**
 * 畫成圖釘的：站點與精確座標的任務單。概略座標的單（`locationCell`）改由格子層畫 ——
 * 它們都落在格子中心，當圖釘會整疊壓在同一點，也會讓人以為那就是地點。
 */
function getPinnedMarkers(
  markers: readonly RescueMapMarkerItem[],
): RescueMapMarkerItem[] {
  return markers.filter(
    (marker) => !isCoarseTicket(marker) && !marker.building,
  );
}

/**
 * Open buildings' entries, kept out of the clusters: a building is never counted among the tickets
 * around it, and its entry stays in sight at any zoom.
 */
function getBuildingMarkers(
  markers: readonly RescueMapMarkerItem[],
): RescueMapMarkerItem[] {
  return markers.filter((marker) => marker.building);
}

/** marker icon 的外觀只由色調（detailType）、圖示（variant）與標籤文字決定 —— 另加選用的 pin／tooltip。 */
function getMarkerIconSignature(item: RescueMapMarkerItem): string {
  const base = `${item.detailType}|${item.variant}|${item.label}`;

  if (!item.pin && !item.tooltip) {
    return base;
  }

  const { pin, tooltip } = item;

  return [
    base,
    pin ? `${pin.color}|${pin.dimmed ? 1 : 0}|${pin.selected ? 1 : 0}` : '',
    tooltip ? `${tooltip.title}|${tooltip.subtitle ?? ''}` : '',
  ].join('|');
}

/** Binds, rebinds or drops the opt-in hover tooltip (`item.tooltip`). */
function syncMarkerTooltip(marker: L.Marker, item: RescueMapMarkerItem) {
  const html = createMapMarkerTooltipHtml(item);

  if (!html) {
    marker.unbindTooltip();
    return;
  }

  marker.unbindTooltip();
  marker.bindTooltip(html, {
    direction: 'top',
    offset: [0, -18],
    opacity: 1,
    className: 'map-marker-tooltip',
  });
}

/**
 * A selected opt-in pin rises above its neighbours. A building's entry lies under the rest, a guest's
 * cell counts included: they are what may be waiting there.
 */
function getMarkerZIndexOffset(item: RescueMapMarkerItem): number {
  if (item.building) {
    return -1000;
  }

  return item.pin?.selected ? 1000 : 0;
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

/**
 * The opt-in `solid` cluster: a flat primary disc in a white ring, 40/46/52px at under 10, 10+ and
 * 20+ (prototype `station-map.jsx` clusterHtml).
 */
function createSolidClusterIcon(
  count: number,
  leaflet: typeof import('leaflet'),
): import('leaflet').DivIcon {
  const dimension = count >= 20 ? 52 : count >= 10 ? 46 : 40;

  return leaflet.divIcon({
    className: 'map-marker-cluster-wrapper',
    html: [
      `<div class="map-marker-cluster map-marker-cluster--solid${count >= 100 ? ' map-marker-cluster--solid-dense' : ''}" style="width:${dimension}px;height:${dimension}px">`,
      `<span class="map-marker-cluster__count">${count}</span>`,
      '</div>',
    ].join(''),
    iconSize: [dimension, dimension],
    iconAnchor: [dimension / 2, dimension / 2],
  });
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

/** The 危險區's stripes, defined once by the canvas's own `<svg>` and filled in by id. */
const HAZARD_STRIPES_ID = 'rescue-map-hazard-stripes';

// Areas lie under the overlay pane (400), so a guest's cells are drawn over them, and the 危險區 over
// the other zones.
const PUBLIC_ZONE_PANE = 'rescueMapPublicZones';
const HAZARD_ZONE_PANE = 'rescueMapHazardZones';

/**
 * 危險區: orange and white stripes (designer 2026-09-25, prototype `wg-hazard.js`). Nothing else on
 * the map is striped, so the stripes alone say 危險, to the colour-blind too. Filled densely: thinned
 * out, the stripes read as a dirty orange.
 *
 * No area takes a tap (prototype ZONE-CLICK-101): a 責任區 is often a whole township, and a tap
 * anywhere in it must still reach the map, for 「在這裡新增」. Its label tells about it instead.
 */
const HAZARD_ZONE_STYLE: L.PathOptions = {
  pane: HAZARD_ZONE_PANE,
  interactive: false,
  color: color.bg.warning.hover,
  weight: 2.5,
  opacity: 1,
  fillColor: `url(#${HAZARD_STRIPES_ID})`,
  fillOpacity: 0.6,
};

/** 責任區 and 標示區: a light fill in their kind's colour (prototype `site-map.jsx`, 2026-10-23). */
function getPublicZoneStyle(zone: RescueMapPublicZone): L.PathOptions {
  const zoneColor = PUBLIC_ZONE_COLORS[zone.kind];

  return {
    pane: PUBLIC_ZONE_PANE,
    interactive: false,
    color: zoneColor,
    weight: 2.5,
    opacity: 0.95,
    fillColor: zoneColor,
    fillOpacity: 0.14,
  };
}

/**
 * An area's title, teams and note, one to a line. Made of elements rather than HTML: the words are
 * typed in the back office.
 */
function createAreaPopupContent(lines: readonly string[]) {
  const content = document.createElement('div');

  lines.forEach((line, index) => {
    const row = document.createElement('div');
    row.textContent = line;

    if (index === 0) {
      row.className = 'map-area-popup__name';
    }

    content.append(row);
  });

  return content;
}

/**
 * The label every area wears, its kind and name (prototype ZONE-STYLE-102), the name cut at 10
 * characters (ZONE-NAME-101). Under the pins, which must stay tappable (prototype
 * `zIndexOffset: -1000`). A tap on it, and only on it, opens the area's popup (prototype
 * ZONE-CLICK-101) — when the popup has more to tell than the label: the teams, a note, or the whole
 * name. Either way the tap stays off the map, as in the prototype.
 */
function createAreaLabel(
  shape: L.Polygon,
  area: RescueMapArea | RescueMapPublicZone,
): AreaLabel {
  const hazard = areaKind(area) === 'hazardous_zone';
  const element = document.createElement('div');
  element.className = hazard
    ? 'map-area-label map-area-label--hazard'
    : 'map-area-label';
  element.textContent = areaLabelText(area);

  if (element.textContent !== areaTitle(area)) {
    element.title = areaTitle(area);
  }

  const marker = L.marker(shape.getBounds().getCenter(), {
    icon: L.divIcon({
      className: 'map-area-label-anchor',
      html: element,
      iconSize: [0, 0],
    }),
    keyboard: false,
    zIndexOffset: -1000,
  });

  if (areaLabelOpensPopup(area)) {
    marker.bindPopup(createAreaPopupContent(areaPopupLines(area)), {
      className: 'map-area-popup',
      maxWidth: 260,
    });
  } else {
    marker.on('click', L.DomEvent.stop);
  }

  return { shape, marker, element, hazard };
}

// How far a popup's tip reaches below where it is placed: Leaflet's own offset, less its tip.
const POPUP_TIP_REACH = -3;

// What an area's label keeps clear of: pins, clusters and cell counts.
const AREA_LABEL_OBSTACLES =
  '.map-marker-stack, .map-marker-cluster, .map-location-cell';

/**
 * Whether the map itself shows at each corner and the middle of `box`: not a button or a card
 * floating over it (prototype `underUi`), one of the map's own controls, or the page past its edge.
 * The topmost element at a point is taken, and one that lets taps through (`pointer-events: none`)
 * is passed over, so only what would catch a tap counts.
 */
function isOverMap(
  host: HTMLElement,
  { left, top }: DOMRect,
  box: ScreenBox,
): boolean {
  const middleX = (box.left + box.right) / 2;
  const middleY = (box.top + box.bottom) / 2;

  return [
    [box.left, box.top],
    [box.right, box.top],
    [box.left, box.bottom],
    [box.right, box.bottom],
    [middleX, middleY],
  ].every(([x, y]) => {
    const element = document.elementFromPoint(left + x, top + y);

    return (
      element !== null &&
      host.contains(element) &&
      element.closest('.leaflet-control') === null
    );
  });
}

/**
 * Puts every area's label where `placeAreaLabels` finds room for it, its middle on that point, and
 * its popup to open just above it. A label with no room is left out until the next time.
 */
function placeAreaLabelsOnMap(map: L.Map, labels: readonly AreaLabel[]) {
  const host = map.getContainer();

  // A hidden map has nothing to measure: the labels wait for the next zoom or redraw.
  if (labels.length === 0 || !host.offsetWidth) {
    return;
  }

  labels.forEach(({ element }) => {
    element.style.display = '';
  });

  // Every label is measured before any is moved, so the page is laid out once.
  const sizes = labels.map(({ element }) => ({
    width: element.offsetWidth,
    height: element.offsetHeight,
  }));
  const hostRect = host.getBoundingClientRect();
  const obstacles = Array.from(
    host.querySelectorAll<HTMLElement>(AREA_LABEL_OBSTACLES),
  )
    .map((element) => element.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .map((rect) => ({
      left: rect.left - hostRect.left,
      top: rect.top - hostRect.top,
      right: rect.right - hostRect.left,
      bottom: rect.bottom - hostRect.top,
    }));
  const spots = placeAreaLabels(
    labels.map(({ shape, hazard }, index) => {
      const bounds = shape.getBounds();
      const northWest = map.latLngToContainerPoint(bounds.getNorthWest());
      const southEast = map.latLngToContainerPoint(bounds.getSouthEast());

      return {
        hazard,
        area: {
          left: northWest.x,
          top: northWest.y,
          right: southEast.x,
          bottom: southEast.y,
        },
        label: sizes[index],
      };
    }),
    {
      width: host.clientWidth,
      height: host.clientHeight,
      obstacles,
      isCovered: (box) => !isOverMap(host, hostRect, box),
    },
  );

  labels.forEach(({ marker, element }, index) => {
    const spot = spots[index];
    element.dataset.place = spot.place;

    if (!('x' in spot)) {
      element.style.display = 'none';
      return;
    }

    marker.setLatLng(map.containerPointToLatLng([spot.x, spot.y]));

    const popup = marker.getPopup();

    if (popup) {
      L.setOptions(popup, {
        offset: L.point(0, -sizes[index].height / 2 - POPUP_TIP_REACH),
      });
    }
  });
}

/** Each part of the area, with its label. Returns the labels, to be placed. */
function renderArea<T extends RescueMapArea>(
  layerGroup: L.FeatureGroup,
  area: T,
  style: (area: T) => L.PathOptions,
): AreaLabel[] {
  return area.polygons.map((polygon) => {
    const shape = L.polygon(polygon, style(area));
    shape.addTo(layerGroup);

    const label = createAreaLabel(shape, area);
    label.marker.addTo(layerGroup);

    return label;
  });
}

/** Draws what changed. The labels are placed afterwards, all together (`placeAreaLabelsOnMap`). */
function syncAreaLayer<T extends RescueMapArea>({
  overlayLayer,
  areas,
  handles,
  style,
}: {
  overlayLayer: L.LayerGroup;
  areas: readonly T[];
  handles: Map<string, AreaHandle>;
  style: (area: T) => L.PathOptions;
}) {
  const nextIds = new Set(areas.map((area) => area.id));
  const drawn: AreaHandle[] = [];

  handles.forEach((handle, id) => {
    if (!nextIds.has(id)) {
      overlayLayer.removeLayer(handle.layerGroup);
      handles.delete(id);
    }
  });

  areas.forEach((area) => {
    const signature = areaSignature(area);
    const existing = handles.get(area.id);

    if (!existing) {
      const layerGroup = L.featureGroup();
      const labels = renderArea(layerGroup, area, style);
      overlayLayer.addLayer(layerGroup);
      const handle = { layerGroup, labels, signature };
      handles.set(area.id, handle);
      drawn.push(handle);
      return;
    }

    if (existing.signature === signature) {
      return;
    }

    existing.layerGroup.clearLayers();
    existing.labels = renderArea(existing.layerGroup, area, style);
    existing.signature = signature;
    drawn.push(existing);
  });

  if (drawn.length === 0) {
    return;
  }

  // A newly drawn area lands on top; stack them again so a smaller one stays over a larger.
  largestAreasFirst(areas).forEach((area) => {
    handles.get(area.id)?.layerGroup.bringToFront();
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
        zIndexOffset: getMarkerZIndexOffset(item),
      }) as L.Marker & { __rescueDetailType?: string };
      marker.__rescueDetailType = item.detailType;

      if (item.tooltip) {
        syncMarkerTooltip(marker, item);
      }

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

      if (item.pin || existing.item.pin) {
        existing.marker.setZIndexOffset(getMarkerZIndexOffset(item));
      }

      if (item.tooltip || existing.item.tooltip) {
        syncMarkerTooltip(existing.marker, item);
      }

      existing.iconSignature = iconSignature;
    }

    (
      existing.marker as L.Marker & { __rescueDetailType?: string }
    ).__rescueDetailType = item.detailType;

    existing.item = item;
  });
}

/**
 * 格子的顏色：淺填色（`syncLocationCellLayer` 的不透明度 0.28），邊線深一階，填色淺了格子的邊界
 * 仍清楚。一般是橘（orange-400 填、orange-500 邊），裡面有急件就用紅（red-500 填、red-700 邊）。
 *
 * 設計 2026-10-24（`origin/sucrelindesign` site-map.jsx、site.css）：淺底配深字
 * （`.map-location-cell`），對比在各種底圖色上都 ≥ 7.6:1。取代 09-18 的 orange-600 @0.90 配白字 ——
 * 那是為了撐白字，整片地圖看起來像淪陷。淺底不可以配白字或橘字；字上仍不加描邊或陰影，讀不清楚時
 * 要調的是這裡（PUB-PS-126）。
 */
function getLocationCellColours(cell: RescueMapLocationCell): {
  fill: string;
  edge: string;
} {
  return cell.variant === 'urgent-ticket'
    ? { fill: color.bg.danger.default, edge: color.bg.danger.hover }
    : {
        fill: primitives.color.orange[400],
        edge: primitives.color.orange[500],
      };
}

function createLocationCellLabelIcon(
  cell: RescueMapLocationCell,
  selected: boolean,
): L.DivIcon {
  return L.divIcon({
    className: 'map-location-cell-wrapper',
    html: [
      `<div class="map-location-cell${selected ? ' map-location-cell--active' : ''}">`,
      `<span class="map-location-cell__count">${cell.count}</span>`,
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
        `${cell.id}:${cell.count}:${cell.variant}:${cell.id === selectedId ? 1 : 0}`,
    )
    .join('|');
}

interface LocationCellLabel {
  cell: RescueMapLocationCell;
  corners: [number, number][];
  marker: L.Marker;
}

const LOCATION_CELL_COUNT_ONLY_CLASS = 'map-location-cell--count-only';
const LOCATION_CELL_SMALL_COUNT_CLASS = 'map-location-cell--small-count';

/**
 * CELL-LABEL-101：依每個格子此刻在畫面上的大小，決定「求助」藏不藏、數字要不要改小字
 * （`locationCellLabelFit`）。格子寬度取平行兩邊之間（頂點到中心平均距離 × √3），H3 的格子怎麼
 * 轉向，字都橫著放得下。字的寬度直接量 —— 字級在手機、平板不同（`displayTextSizeCss`）。
 *
 * 先把所有標籤恢復成整句再一起量，最後才一起改：只排版一次，不是每格一次。
 */
function fitLocationCellLabels(
  map: L.Map,
  labels: readonly LocationCellLabel[],
) {
  // 地圖被藏起來時量不到：先不動，等下一次縮放或資料刷新再量。
  if (!map.getContainer().offsetWidth) {
    return;
  }

  const elements = labels.map(({ marker }) =>
    marker.getElement()?.querySelector<HTMLElement>('.map-location-cell'),
  );

  elements.forEach((element) =>
    element?.classList.remove(
      LOCATION_CELL_COUNT_ONLY_CLASS,
      LOCATION_CELL_SMALL_COUNT_CLASS,
    ),
  );

  const fits = labels.map(({ cell, corners }, index) => {
    const count = elements[index]?.querySelector<HTMLElement>(
      '.map-location-cell__count',
    );
    const unit = elements[index]?.querySelector<HTMLElement>(
      '.map-location-cell__unit',
    );

    if (!count || !unit) {
      return null;
    }

    const centre = map.latLngToLayerPoint(cell.position);
    const radius =
      corners.reduce(
        (sum, corner) =>
          sum + map.latLngToLayerPoint(corner).distanceTo(centre),
        0,
      ) / corners.length;

    return locationCellLabelFit(radius * Math.sqrt(3), {
      whole: unit.offsetLeft + unit.offsetWidth - count.offsetLeft,
      count: count.offsetWidth,
    });
  });

  elements.forEach((element, index) => {
    const fit = fits[index];

    element?.classList.toggle(
      LOCATION_CELL_COUNT_ONLY_CLASS,
      fit === 'count' || fit === 'small-count',
    );
    element?.classList.toggle(
      LOCATION_CELL_SMALL_COUNT_CLASS,
      fit === 'small-count',
    );
  });
}

/**
 * 訪客的概略區塊：六角形本身 ＋ 中央的數量。整層重畫 —— 格子數量少，而簽章相同時整個跳過，
 * 不會每次資料刷新都閃爍。選取狀態由六角形自己表達（線變粗、底色變深），數字不換色。
 * 回傳各格的標籤，縮放時要重新量（`fitLocationCellLabels`）。
 */
function syncLocationCellLayer({
  map,
  cellLayer,
  cells,
  selectedId,
  onCellClickRef,
}: {
  map: L.Map;
  cellLayer: L.LayerGroup;
  cells: readonly RescueMapLocationCell[];
  selectedId: string | undefined;
  onCellClickRef: React.MutableRefObject<
    ((cell: RescueMapLocationCell) => void) | undefined
  >;
}): LocationCellLabel[] {
  cellLayer.clearLayers();

  const labels = cells.map((cell) => {
    const selected = cell.id === selectedId;
    const { fill, edge } = getLocationCellColours(cell);
    const corners = locationCellBoundary(cell.cell);
    const onClick = () => onCellClickRef.current?.(cell);

    L.polygon(corners, {
      color: edge,
      weight: selected ? 4 : 2,
      fillColor: fill,
      fillOpacity: selected ? 0.4 : 0.28,
      // A tap on a cell picks the cell, and is not also a tap on the map (which picks a point).
      bubblingMouseEvents: false,
    })
      .on('click', onClick)
      .addTo(cellLayer);

    const marker = L.marker(cell.position, {
      icon: createLocationCellLabelIcon(cell, selected),
      title: `${cell.count} 筆求助（概略區塊）`,
      keyboard: true,
    })
      .on('click', onClick)
      .addTo(cellLayer);

    return { cell, corners, marker };
  });

  // A label is measured once it is on the map.
  fitLocationCellLabels(map, labels);

  return labels;
}

export function RescueMapCanvas({
  controller,
  onMarkerClick,
  locationCells,
  onLocationCellClick,
  previewMarker,
  cursor,
  onMapClick,
  layoutKey,
  showScale = false,
  viewportStore,
  draftPoint,
  onDraftPointChange,
  draftPointAction,
  clusterAppearance = 'default',
  clusterMaxZoom,
  zoomControlPosition,
  onMapReady,
  onViewChange,
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
  const buildingLayerRef = useRef<L.LayerGroup | null>(null);
  const buildingHandlesRef = useRef<Map<string, MarkerHandle>>(new Map());
  const cellLayerSignatureRef = useRef<string | null>(null);
  const cellLabelsRef = useRef<LocationCellLabel[]>([]);
  const previewMarkerRef = useRef<L.Marker | null>(null);
  const draftMarkerRef = useRef<L.Marker | null>(null);
  const draftBubbleRef = useRef<L.Marker | null>(null);
  // While the crosshair is dragged, the map autopans: that move is not the person moving the map.
  const draftDraggingRef = useRef(false);
  // The element the bubble's content is portaled into, once its marker is on the map.
  const [draftBubbleHost, setDraftBubbleHost] = useState<HTMLElement | null>(
    null,
  );
  const markerHandlesRef = useRef<Map<string, MarkerHandle>>(new Map());
  const closureAreaHandlesRef = useRef<Map<string, AreaHandle>>(new Map());
  const publicZoneHandlesRef = useRef<Map<string, AreaHandle>>(new Map());
  // Places the areas' labels again, once what is being drawn now is on the map.
  const queueAreaLabelsRef = useRef<(() => void) | null>(null);
  const controllerRef = useRef(controller);
  const onMapClickRef = useRef(onMapClick);
  const onMarkerClickRef = useRef(onMarkerClick);
  const onLocationCellClickRef = useRef(onLocationCellClick);
  const onDraftPointChangeRef = useRef(onDraftPointChange);
  const onViewChangeRef = useRef(onViewChange);
  const initialViewportStateRef = useRef(externalViewportState);
  // Read once, when the map is built.
  const mapOptionsRef = useRef({
    clusterAppearance,
    clusterMaxZoom,
    zoomControlPosition,
    onMapReady,
  });

  controllerRef.current = controller;
  onMapClickRef.current = onMapClick;
  onMarkerClickRef.current = onMarkerClick;
  onLocationCellClickRef.current = onLocationCellClick;
  onDraftPointChangeRef.current = onDraftPointChange;
  onViewChangeRef.current = onViewChange;

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

    map.createPane(PUBLIC_ZONE_PANE).style.zIndex = '380';
    map.createPane(HAZARD_ZONE_PANE).style.zIndex = '390';

    const mapOptions = mapOptionsRef.current;

    if (mapOptions.zoomControlPosition) {
      map.zoomControl?.setPosition(mapOptions.zoomControlPosition);
    }

    const overlayLayer = L.layerGroup();
    const cellLayer = L.layerGroup();
    const buildingLayer = L.layerGroup();
    const markerHandles = markerHandlesRef.current;
    const buildingHandles = buildingHandlesRef.current;
    const closureAreaHandles = closureAreaHandlesRef.current;
    const publicZoneHandles = publicZoneHandlesRef.current;
    let cancelled = false;

    mapRef.current = map;
    overlayLayerRef.current = overlayLayer;
    cellLayerRef.current = cellLayer;
    buildingLayerRef.current = buildingLayer;

    overlayLayer.addTo(map);
    // Drawn by the cell effect below, which runs after this one in the same commit.
    cellLayer.addTo(map);
    buildingLayer.addTo(map);
    syncMarkerLayer({
      markerLayer: buildingLayer,
      items: getBuildingMarkers(controllerRef.current.markers),
      handles: buildingHandles,
      leaflet: L,
      onMarkerClickRef,
    });

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

      const clusterOptions: MarkerClusterOptions = {
        animate: false,
        animateAddingMarkers: false,
        chunkedLoading: true,
        showCoverageOnHover: false,
        spiderfyOnMaxZoom: true,
        iconCreateFunction: (cluster) =>
          mapOptions.clusterAppearance === 'solid'
            ? createSolidClusterIcon(cluster.getChildCount(), L)
            : createClusterIcon({
                count: cluster.getChildCount(),
                tone: resolveClusterTone(cluster.getAllChildMarkers()),
                leaflet: L,
              }),
        ...(mapOptions.clusterMaxZoom === undefined
          ? {}
          : { disableClusteringAtZoom: mapOptions.clusterMaxZoom + 1 }),
      };
      const markerLayer =
        clusterFactory?.(clusterOptions) ??
        (clusterCtor ? new clusterCtor(clusterOptions) : null);

      if (!markerLayer) {
        return;
      }

      if (mapOptions.clusterAppearance === 'solid') {
        markerLayer.on('clustermouseover', (event) => {
          const cluster = (
            event as L.LeafletEvent & {
              layer: L.Marker & {
                getChildCount: () => number;
              };
            }
          ).layer;

          cluster
            .bindTooltip(`${cluster.getChildCount()} 個站點 · 點擊放大`, {
              direction: 'top',
              offset: [0, -22],
              opacity: 1,
              className: 'map-marker-tooltip',
            })
            .openTooltip();
        });
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
      queueAreaLabelsRef.current?.();
    });

    let viewportSyncTimer: number | undefined;

    const syncViewport = () => {
      const currentMap = mapRef.current;

      if (!currentMap) {
        return;
      }

      syncViewportStateToController(currentMap, controllerRef.current);
    };

    // Told on the map's own moves, as the prototype's `watchMapLast` is on `moveend`; not on the
    // first sync below, which only reports where the map opened.
    const reportViewChange = () => {
      const center = map.getCenter();

      onViewChangeRef.current?.({
        center: [center.lat, center.lng],
        zoom: map.getZoom(),
      });
    };

    const scheduleViewportSync = () => {
      window.clearTimeout(viewportSyncTimer);
      viewportSyncTimer = window.setTimeout(() => {
        syncViewport();
        reportViewChange();
      }, VIEWPORT_SYNC_DEBOUNCE_MS);
    };

    const handleMapClick = (event: L.LeafletMouseEvent) => {
      onMapClickRef.current?.([event.latlng.lat, event.latlng.lng]);
    };

    // A picked point is let go once the map moves under it, as its bubble would point elsewhere
    // (prototype site-map.jsx:430-434). Resizing does not start a move; the crosshair's own
    // autopan does, and is not the person moving the map.
    const releaseDraftPoint = () => {
      if (!draftDraggingRef.current) {
        onDraftPointChangeRef.current?.(null);
      }
    };

    // A cell grows and shrinks on screen with the zoom: how much of its label fits changes.
    const fitCellLabels = () =>
      fitLocationCellLabels(map, cellLabelsRef.current);

    // An area's label finds room among the cell counts and pins, which move with the zoom, so it
    // waits for them: until the zoom's handlers have run, the clusters' among them, which were added
    // after these; or until the render that redrew them is done. Asked for many times, it is placed
    // once.
    let areaLabelsQueued = false;
    const queueAreaLabels = () => {
      if (areaLabelsQueued) {
        return;
      }

      areaLabelsQueued = true;
      queueMicrotask(() => {
        areaLabelsQueued = false;

        if (mapRef.current !== map) {
          return;
        }

        placeAreaLabelsOnMap(
          map,
          [
            ...closureAreaHandles.values(),
            ...publicZoneHandles.values(),
          ].flatMap((handle) => handle.labels),
        );
      });
    };

    queueAreaLabelsRef.current = queueAreaLabels;

    map.on('moveend', scheduleViewportSync);
    map.on('zoomend', scheduleViewportSync);
    map.on('zoomend', fitCellLabels);
    map.on('zoomend', queueAreaLabels);
    map.on('resize', queueAreaLabels);
    map.on('click', handleMapClick);
    map.on('movestart', releaseDraftPoint);
    map.on('zoomstart', releaseDraftPoint);

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

    mapOptions.onMapReady?.(map);

    return () => {
      window.clearTimeout(viewportSyncTimer);
      resizeObserver.disconnect();
      map.off('moveend', scheduleViewportSync);
      map.off('zoomend', scheduleViewportSync);
      map.off('zoomend', fitCellLabels);
      map.off('zoomend', queueAreaLabels);
      map.off('resize', queueAreaLabels);
      map.off('click', handleMapClick);
      map.off('movestart', releaseDraftPoint);
      map.off('zoomstart', releaseDraftPoint);
      cancelled = true;

      markerHandles.clear();
      buildingHandles.clear();
      closureAreaHandles.clear();
      publicZoneHandles.clear();
      markerLayerRef.current = null;
      overlayLayerRef.current = null;
      cellLayerRef.current = null;
      buildingLayerRef.current = null;
      cellLayerSignatureRef.current = null;
      cellLabelsRef.current = [];
      queueAreaLabelsRef.current = null;
      previewMarkerRef.current = null;
      draftMarkerRef.current = null;
      draftBubbleRef.current = null;
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
      maxNativeZoom: nextTileLayer.maxNativeZoom,
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
    const buildingLayer = buildingLayerRef.current;

    if (buildingLayer) {
      syncMarkerLayer({
        markerLayer: buildingLayer,
        items: getBuildingMarkers(controller.markers),
        handles: buildingHandlesRef.current,
        leaflet: L,
        onMarkerClickRef,
      });
    }

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
    queueAreaLabelsRef.current?.();
  }, [controller.markers]);

  useEffect(() => {
    const map = mapRef.current;
    const cellLayer = cellLayerRef.current;

    if (!map || !cellLayer) {
      return;
    }

    const signature = getLocationCellLayerSignature(
      locationCells,
      controller.selectedMarkerId,
    );

    if (signature === cellLayerSignatureRef.current) {
      return;
    }

    cellLayerSignatureRef.current = signature;
    cellLabelsRef.current = syncLocationCellLayer({
      map,
      cellLayer,
      cells: locationCells,
      selectedId: controller.selectedMarkerId,
      onCellClickRef: onLocationCellClickRef,
    });
    queueAreaLabelsRef.current?.();
  }, [locationCells, controller.selectedMarkerId]);

  useEffect(() => {
    const overlayLayer = overlayLayerRef.current;

    if (!overlayLayer) {
      return;
    }

    syncAreaLayer({
      overlayLayer,
      areas: controller.closureAreas,
      handles: closureAreaHandlesRef.current,
      style: () => HAZARD_ZONE_STYLE,
    });
    queueAreaLabelsRef.current?.();
  }, [controller.closureAreas]);

  useEffect(() => {
    const overlayLayer = overlayLayerRef.current;

    if (!overlayLayer) {
      return;
    }

    syncAreaLayer({
      overlayLayer,
      areas: controller.publicZones,
      handles: publicZoneHandlesRef.current,
      style: getPublicZoneStyle,
    });
    queueAreaLabelsRef.current?.();
  }, [controller.publicZones]);

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

  const draftLat = draftPoint?.lat;
  const draftLng = draftPoint?.lng;

  // Two markers: the crosshair, which drags, and the bubble, which is not to be dragged by and
  // keeps up with the crosshair on the way. A real marker rather than a picture floated over the
  // map, so that a point under an existing pin can be reached by tapping beside it and dragging
  // across (designer, 2026-09-19).
  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    if (draftLat === undefined || draftLng === undefined) {
      draftMarkerRef.current?.remove();
      draftBubbleRef.current?.remove();
      draftMarkerRef.current = null;
      draftBubbleRef.current = null;
      setDraftBubbleHost(null);
      return;
    }

    const position: L.LatLngTuple = [draftLat, draftLng];

    if (draftMarkerRef.current) {
      // After its own drag, Leaflet has already put it there.
      if (!draftDraggingRef.current) {
        draftMarkerRef.current.setLatLng(position);
        draftBubbleRef.current?.setLatLng(position);
      }
      return;
    }

    const crosshair = L.marker(position, {
      icon: createDraftPointIcon(),
      draggable: true,
      autoPan: true,
      keyboard: false,
      zIndexOffset: 1000,
      title: '拖曳可移動位置',
    });
    // An empty, zero-size icon at the point: the bubble's content is portaled in and laid out
    // above it. Interactive, so its buttons take taps.
    const bubble = L.marker(position, {
      icon: L.divIcon({
        className: '',
        html: '',
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      }),
      keyboard: false,
      zIndexOffset: 1100,
    });

    // Leaflet counts a tap as the marker's only if the marker listens for it; one that does not
    // passes the tap on to the map, which would pick a new point under the bubble's own button.
    bubble.on('click', () => undefined);

    crosshair.on('dragstart', () => {
      draftDraggingRef.current = true;
    });
    crosshair.on('drag', () => bubble.setLatLng(crosshair.getLatLng()));
    crosshair.on('dragend', () => {
      draftDraggingRef.current = false;

      const { lat, lng } = crosshair.getLatLng();
      onDraftPointChangeRef.current?.({ lat, lng });
    });

    crosshair.addTo(map);
    bubble.addTo(map);
    draftMarkerRef.current = crosshair;
    draftBubbleRef.current = bubble;
    setDraftBubbleHost(bubble.getElement() ?? null);
  }, [draftLat, draftLng]);

  return (
    <>
      <div ref={hostRef} style={{ width: '100%', height: '100%' }} />
      {/* Not `display: none`, which leaves a pattern unpainted in some browsers. */}
      <svg
        width="0"
        height="0"
        aria-hidden="true"
        focusable="false"
        style={{ position: 'absolute' }}
      >
        <defs>
          <pattern
            id={HAZARD_STRIPES_ID}
            patternUnits="userSpaceOnUse"
            width="16"
            height="16"
            patternTransform="rotate(45)"
          >
            <rect
              width="16"
              height="16"
              fill={primitives.color.neutral.white}
            />
            <rect width="8" height="16" fill={color.bg.warning.default} />
          </pattern>
        </defs>
      </svg>
      {draftBubbleHost && draftPointAction
        ? createPortal(draftPointAction, draftBubbleHost)
        : null}
    </>
  );
}
