'use client';

import L from 'leaflet';
import { useEventCallback } from 'usehooks-ts';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  DraftPoint,
  MapContainer,
  MarkerLayer,
  PolygonLayer,
  TileLayer,
  type MarkerAppearance,
  type MarkerClustering,
  type MarkerLayerHandle,
  type PolygonLabel,
  type PolygonLayerHandle,
  observeMapViewport,
  readMapViewport,
  type MapViewport,
  PolygonDraw,
  PolygonEditor,
  useMap,
} from '@rescue-frontend/leaflet';
import { createStore, useStore } from 'zustand';

import {
  areaKind,
  areaLabelOpensPopup,
  areaLabelText,
  areaPopupLines,
  areaSignature,
  areaTitle,
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
  RescueMapDraftArea,
  RescueMapDraftPoint,
  RescueMapEditArea,
  RescueMapLocationCell,
  RescueMapMarkerItem,
  RescueMapPublicZone,
  RescueMapView,
  RescueMapViewportStoreSnapshot,
  RescueMapViewportStoreLike,
} from '../../types';
import {
  createMapMarkerIcon,
  createMapMarkerTooltipHtml,
  shownBuildingTickets,
} from '../map-marker';

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
  /** The outline being drawn: see `Map`'s prop of the same name. */
  draftArea?: RescueMapDraftArea | null;
  /** The boundary being changed: see `Map`'s prop of the same name. */
  editArea?: RescueMapEditArea | null;
  cursor?: string;
  disableDoubleClickZoom?: boolean;
  editingArea?: boolean;
  /** Draws 責任區 and 標示區 as the admin 互助地圖 does; the site's own look when unset. */
  adminAreaStyle?: boolean;
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
function createDraftPointIcon(): L.DivIconOptions {
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

  return {
    className: '',
    html: `<div style="cursor:grab;line-height:0"><svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">${ring(halo, 4)}${ticks(halo, 4)}${ring(stroke, 2)}${ticks(stroke, 2)}</svg></div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  };
}

/** moveend／zoomend 後延遲寫回路由狀態，把連續手勢合併成一次提交。 */
const VIEWPORT_SYNC_DEBOUNCE_MS = 250;
const EMPTY_VIEWPORT_STORE = createStore<RescueMapViewportStoreSnapshot>()(
  () => ({}),
);

/**
 * 畫成圖釘的：站點與精確座標的任務單。概略座標的單（`locationCell`）改由格子層畫 ——
 * 它們都落在格子中心，當圖釘會整疊壓在同一點，也會讓人以為那就是地點。
 */
function getPinnedMarkers(
  markers: readonly RescueMapMarkerItem[],
): RescueMapMarkerItem[] {
  return markers.filter(
    (marker) =>
      !isCoarseTicket(marker) && !marker.building && !marker.pin?.selected,
  );
}

/**
 * Open buildings' entries, kept out of the clusters: a building is never counted among the tickets
 * around it, and its entry stays in sight at any zoom. So does the pin picked on 互助地圖: its panel
 * is open beside the map, and a number must not stand in for what is being read about. A coarse
 * ticket stays a cell even when picked: a pin at the cell's centre would read as its exact spot.
 */
function getBuildingMarkers(
  markers: readonly RescueMapMarkerItem[],
): RescueMapMarkerItem[] {
  return markers.filter(
    (marker) =>
      marker.building || (marker.pin?.selected && !isCoarseTicket(marker)),
  );
}

/** marker icon 的外觀只由色調（detailType）、圖示（variant）與標籤文字決定，大樓另加件數 —— 另加選用的 pin／tooltip。 */
function getMarkerIconSignature(item: RescueMapMarkerItem): string {
  const base = item.building
    ? `${item.detailType}|${item.variant}|${item.label}|${item.building.ticketCount}`
    : `${item.detailType}|${item.variant}|${item.label}`;

  if (!item.pin && !item.tooltip) {
    return base;
  }

  const { pin, tooltip } = item;

  return [
    base,
    pin
      ? `${pin.shape ?? 'drop'}|${pin.color}|${pin.dimmed ? 1 : 0}|${pin.selected ? 1 : 0}${pin.shape === 'station' ? `|${item.stationMeta?.type ?? ''}` : ''}`
      : '',
    tooltip ? `${tooltip.title}|${tooltip.subtitle ?? ''}` : '',
  ].join('|');
}

function getMarkerAppearance(item: RescueMapMarkerItem): MarkerAppearance {
  const content = createMapMarkerTooltipHtml(item);
  return {
    icon: createMapMarkerIcon(item, L),
    zIndexOffset: getMarkerZIndexOffset(item),
    tooltip: content
      ? {
          content,
          options: {
            direction: 'top',
            offset: [0, -18],
            opacity: 1,
            className: 'map-marker-tooltip',
          },
        }
      : undefined,
  };
}

/**
 * A selected opt-in pin rises above its neighbours. A building's entry with no count lies under the
 * rest, a guest's cell counts included: they are what may be waiting there. One that counts its
 * tickets stands among them.
 */
function getMarkerZIndexOffset(item: RescueMapMarkerItem): number {
  if (item.building) {
    return shownBuildingTickets(item) > 0 ? 0 : -1000;
  }

  return item.pin?.selected ? 1000 : 0;
}

function resolveClusterTone(
  markers: readonly RescueMapMarkerItem[],
): 'station' | 'ticket' {
  const stationCount = markers.filter(
    (marker) => marker.detailType === 'station',
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

/** The edge of the area picked in the admin list: heavier, so it stands out among the rest. */
const HIGHLIGHTED_WEIGHT = 5;

function getHazardZoneStyle(area: RescueMapArea): L.PathOptions {
  return area.highlighted
    ? { ...HAZARD_ZONE_STYLE, weight: HIGHLIGHTED_WEIGHT }
    : HAZARD_ZONE_STYLE;
}

function getAdminHazardZoneStyle(area: RescueMapArea): L.PathOptions {
  return {
    ...HAZARD_ZONE_STYLE,
    weight: area.highlighted ? 3.5 : 2.5,
    opacity: area.dimmed ? 0.5 : HAZARD_ZONE_STYLE.opacity,
    fillOpacity: area.dimmed ? 0.3 : HAZARD_ZONE_STYLE.fillOpacity,
  };
}

/**
 * 責任區 and 標示區: a light fill in their kind's colour (prototype `site-map.jsx`, 2026-10-23). A
 * 標示區 the public cannot see (admin only) is drawn dashed and fainter, so an admin can tell it apart.
 */
function getPublicZoneStyle(zone: RescueMapPublicZone): L.PathOptions {
  const zoneColor = PUBLIC_ZONE_COLORS[zone.kind];
  const hidden = zone.isPublic === false;

  return {
    pane: PUBLIC_ZONE_PANE,
    interactive: false,
    color: zoneColor,
    weight: zone.highlighted ? HIGHLIGHTED_WEIGHT : 2.5,
    opacity: 0.95,
    fillColor: zoneColor,
    fillOpacity: hidden ? 0.06 : 0.14,
    ...(hidden ? { dashArray: '8 6' } : {}),
  };
}

/**
 * 責任區 and 標示區 on the admin 互助地圖 (prototype `map-canvas.jsx`, design review 2026-11-03): a
 * light fill (0.07) and a 3px line; the one picked is filled 0.14 and drawn at 4px, and the others
 * fade (line 0.45, fill 0.03) so it stands out. `getPublicZoneStyle` is the site's and stays as it is.
 */
function getAdminZoneStyle(zone: RescueMapPublicZone): L.PathOptions {
  const zoneColor = PUBLIC_ZONE_COLORS[zone.kind];
  const hidden = zone.isPublic === false;

  return {
    pane: PUBLIC_ZONE_PANE,
    interactive: false,
    color: zoneColor,
    weight: zone.highlighted ? 4 : 3,
    opacity: zone.dimmed ? 0.45 : 0.95,
    fillColor: zoneColor,
    fillOpacity: zone.highlighted
      ? 0.14
      : zone.dimmed
        ? 0.03
        : hidden
          ? 0.04
          : 0.07,
    ...(hidden ? { dashArray: '8 6' } : {}),
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

function getAreaLabel(area: RescueMapArea | RescueMapPublicZone): PolygonLabel {
  const hazard = areaKind(area) === 'hazardous_zone';
  const text = areaLabelText(area);
  const title = areaTitle(area);
  return {
    text,
    title: text === title ? undefined : title,
    className: hazard
      ? 'map-area-label map-area-label--hazard'
      : 'map-area-label',
    anchorClassName: 'map-area-label-anchor',
    priority: hazard ? 1 : 0,
    popup: areaLabelOpensPopup(area)
      ? {
          content: createAreaPopupContent(areaPopupLines(area)),
          options: { className: 'map-area-popup', maxWidth: 260 },
        }
      : undefined,
  };
}

const AREA_LABEL_OBSTACLES =
  '.map-marker-stack, .map-marker-cluster, .map-location-cell';

function syncViewportStateToController(
  { center, zoom, west, south, east, north }: MapViewport,
  controller: RescueMapControllerValue,
) {
  controller.setViewportState({
    center,
    zoom,
    bbox: [west, south, east, north],
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
  clickCell,
}: {
  map: L.Map;
  cellLayer: L.LayerGroup;
  cells: readonly RescueMapLocationCell[];
  selectedId: string | undefined;
  clickCell: ((cell: RescueMapLocationCell) => void) | undefined;
}): LocationCellLabel[] {
  cellLayer.clearLayers();

  const labels = cells.map((cell) => {
    const selected = cell.id === selectedId;
    const { fill, edge } = getLocationCellColours(cell);
    const corners = locationCellBoundary(cell.cell);
    const onClick = () => clickCell?.(cell);

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

/** A corner of a boundary being changed: a white dot with a dark rim, big enough to grab. */
function createEditCornerIcon(invalid: boolean): L.DivIconOptions {
  const stroke = invalid ? color.bg.danger.default : color.fg.neutral.default;

  return {
    className: 'rescue-map-edit-corner',
    html: `<span style="display:block;width:16px;height:16px;border-radius:50%;background:${color.bg.neutral.default};border:3px solid ${stroke};box-sizing:border-box;cursor:move"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  };
}

const EDIT_MIDPOINT_ICON: L.DivIconOptions = {
  className: 'rescue-map-edit-midpoint',
  html: `<span style="display:flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:50%;background:${color.bg.neutral.default};border:1.5px solid ${color.fg.neutral.muted};color:${color.fg.neutral.muted};font:700 11px/1 sans-serif;box-sizing:border-box;cursor:copy">+</span>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
};

const DRAFT_POINT_ICON = createDraftPointIcon();

const POLYGON_STYLES = [color.fg.neutral.default, color.bg.danger.default].map(
  (stroke) => ({
    outline: {
      color: stroke,
      weight: 2.5,
      dashArray: '6 6',
      fillColor: stroke,
      fillOpacity: 0.18,
    },
    vertex: {
      radius: 6,
      color: stroke,
      weight: 3,
      fillColor: color.bg.neutral.default,
      fillOpacity: 1,
    },
  }),
);

const EDIT_CORNER_ICONS = [
  createEditCornerIcon(false),
  createEditCornerIcon(true),
];

export function RescueMapCanvas(props: RescueMapCanvasProps) {
  const {
    controller,
    viewportStore,
    draftArea,
    editArea,
    draftPoint,
    draftPointAction,
    onDraftPointChange,
  } = props;
  const viewport = useStore(viewportStore ?? EMPTY_VIEWPORT_STORE).position;
  const draftStyle = POLYGON_STYLES[Number(draftArea?.invalid ?? false)];
  const editStyle = POLYGON_STYLES[Number(editArea?.invalid ?? false)];

  const labels = useRef<PolygonLayerHandle>(null);
  const standaloneMarkers = useRef<MarkerLayerHandle>(null);
  const relayoutLabels = useEventCallback(() => labels.current?.relayout());
  const closeMarkerTooltips = useEventCallback(() =>
    standaloneMarkers.current?.closeTooltips(),
  );
  const markerItems = useMemo(() => {
    const pinned = getPinnedMarkers(controller.markers);
    const standalone = getBuildingMarkers(controller.markers);
    if (props.editingArea) standalone.push(...pinned);
    return { standalone, clustered: props.editingArea ? [] : pinned };
  }, [controller.markers, props.editingArea]);
  const areas = useMemo(
    () => [...controller.closureAreas, ...controller.publicZones],
    [controller.closureAreas, controller.publicZones],
  );
  const clusterOptions: MarkerClustering<RescueMapMarkerItem>['options'] = {};
  if (props.clusterMaxZoom !== undefined) {
    clusterOptions.disableClusteringAtZoom = props.clusterMaxZoom + 1;
  }
  const cluster: MarkerClustering<RescueMapMarkerItem> = {
    options: clusterOptions,
    icon: (items, cluster) =>
      props.clusterAppearance === 'solid'
        ? createSolidClusterIcon(cluster.getChildCount(), L)
        : createClusterIcon({
            count: cluster.getChildCount(),
            tone: resolveClusterTone(items),
            leaflet: L,
          }),
    onHover:
      props.clusterAppearance === 'solid'
        ? (cluster) => {
            cluster
              .bindTooltip(cluster.getChildCount() + ' 個站點 · 點擊放大', {
                direction: 'top',
                offset: [0, -22],
                opacity: 1,
                className: 'map-marker-tooltip',
              })
              .openTooltip();
          }
        : undefined,
  };
  const tile = controller.tileLayer;

  return (
    <MapContainer
      center={viewport?.center ?? controller.initialView.center}
      zoom={viewport?.zoom ?? controller.initialView.zoom}
      options={{ zoomControl: false, minZoom: 7, maxZoom: 18 }}
      resizeOptions={{ animate: false }}
      style={{ width: '100%', height: '100%' }}
    >
      <RescueMapLayers
        {...props}
        viewport={viewport}
        relayoutLabels={relayoutLabels}
        closeMarkerTooltips={closeMarkerTooltips}
      />
      {tile?.url && tile.attribution && (
        <TileLayer
          key={[tile.url, tile.attribution, tile.maxNativeZoom].join('|')}
          url={tile.url}
          options={{
            attribution: tile.attribution,
            maxNativeZoom: tile.maxNativeZoom,
          }}
        />
      )}
      <MarkerLayer
        items={markerItems.standalone}
        appearance={getMarkerAppearance}
        appearanceKey={getMarkerIconSignature}
        onClick={props.onMarkerClick}
        onUpdate={relayoutLabels}
        ref={standaloneMarkers}
      />
      <MarkerLayer
        items={markerItems.clustered}
        appearance={getMarkerAppearance}
        appearanceKey={getMarkerIconSignature}
        onClick={props.onMarkerClick}
        onUpdate={relayoutLabels}
        cluster={cluster}
      />
      <PolygonLayer<RescueMapArea | RescueMapPublicZone>
        items={areas}
        getStyle={(area) =>
          'kind' in area
            ? (props.adminAreaStyle ? getAdminZoneStyle : getPublicZoneStyle)(
                area,
              )
            : (props.adminAreaStyle
                ? getAdminHazardZoneStyle
                : getHazardZoneStyle)(area)
        }
        getLabel={getAreaLabel}
        getRevision={(area) =>
          String(Boolean(props.adminAreaStyle)) + areaSignature(area)
        }
        obstacleSelector={AREA_LABEL_OBSTACLES}
        ref={labels}
      />
      {draftArea && (
        <PolygonDraw
          points={draftArea.points}
          disableDoubleClickZoom={false}
          outlineStyle={draftStyle.outline}
          vertexStyle={draftStyle.vertex}
          onChange={draftArea.drawing?.onChange}
          onFinish={draftArea.drawing?.onFinish}
        />
      )}
      {editArea && (
        <PolygonEditor
          points={editArea.points}
          outlineStyle={editStyle.outline}
          cornerIcon={EDIT_CORNER_ICONS[Number(editArea.invalid)]}
          midpointIcon={EDIT_MIDPOINT_ICON}
          onChange={editArea.onChange}
        />
      )}
      <DraftPoint
        point={draftPoint ?? null}
        onChange={onDraftPointChange}
        icon={DRAFT_POINT_ICON}
        title="拖曳可移動位置"
      >
        {draftPointAction}
      </DraftPoint>
    </MapContainer>
  );
}

function RescueMapLayers({
  controller,
  locationCells,
  onLocationCellClick,
  previewMarker,
  cursor,
  disableDoubleClickZoom = false,
  editingArea = false,
  onMapClick,
  layoutKey,
  showScale = false,
  viewport,
  relayoutLabels,
  closeMarkerTooltips,
  zoomControlPosition,
  onMapReady,
  onViewChange,
}: RescueMapCanvasProps & {
  viewport: RescueMapViewportStoreSnapshot['position'];
  relayoutLabels: () => void;
  closeMarkerTooltips: () => void;
}) {
  const map = useMap();
  const cellLayerRef = useRef<L.LayerGroup | null>(null);
  const cellLayerSignatureRef = useRef<string | null>(null);
  const cellLabelsRef = useRef<LocationCellLabel[]>([]);
  const getController = useEventCallback(() => controller);
  const clickMap = useEventCallback(onMapClick);
  const clickCell = useEventCallback(onLocationCellClick);
  const changeView = useEventCallback(onViewChange);
  // Read once, when the map is built.
  const mapOptionsRef = useRef({
    zoomControlPosition,
    onMapReady,
  });

  useEffect(() => {
    map.attributionControl.setPrefix(false);

    const publicZonePane =
      map.getPane(PUBLIC_ZONE_PANE) ?? map.createPane(PUBLIC_ZONE_PANE);
    const hazardZonePane =
      map.getPane(HAZARD_ZONE_PANE) ?? map.createPane(HAZARD_ZONE_PANE);
    publicZonePane.style.zIndex = '380';
    hazardZonePane.style.zIndex = '390';

    const mapOptions = mapOptionsRef.current;

    // Always on the map; the `Map` decides whether it shows (`showZoomControl`).
    const zoomControl = L.control
      .zoom({
        position: mapOptions.zoomControlPosition ?? 'topleft',
        zoomInTitle: '放大',
        zoomOutTitle: '縮小',
      })
      .addTo(map);

    const cellLayer = L.layerGroup().addTo(map);
    cellLayerRef.current = cellLayer;

    const stopViewport = observeMapViewport(
      map,
      (viewport) => {
        syncViewportStateToController(viewport, getController());
        changeView?.({ center: viewport.center, zoom: viewport.zoom });
      },
      {
        settleMs: VIEWPORT_SYNC_DEBOUNCE_MS,
        reportInitial: false,
        sampleOnSettle: true,
      },
    );

    const handleMapClick = (event: L.LeafletMouseEvent) => {
      clickMap?.([event.latlng.lat, event.latlng.lng]);
    };

    // A cell grows and shrinks on screen with the zoom: how much of its label fits changes.
    const fitCellLabels = () =>
      fitLocationCellLabels(map, cellLabelsRef.current);

    map.on('zoomend', fitCellLabels);
    map.on('click', handleMapClick);

    const initialFrame = window.requestAnimationFrame(() => {
      try {
        map.invalidateSize({ animate: false });
        syncViewportStateToController(readMapViewport(map), getController());
      } catch {
        // Ignore initial invalidation race during client mount.
      }
    });

    mapOptions.onMapReady?.(map);

    return () => {
      stopViewport();
      window.cancelAnimationFrame(initialFrame);
      map.off('zoomend', fitCellLabels);
      map.off('click', handleMapClick);
      zoomControl.remove();
      cellLayer.remove();
      cellLayerRef.current = null;
      cellLayerSignatureRef.current = null;
      cellLabelsRef.current = [];
    };
  }, [changeView, clickMap, getController, map]);

  useEffect(() => {
    const currentCenter = map.getCenter();
    const currentZoom = map.getZoom();
    const [nextLat, nextLng] =
      viewport?.center ?? controller.initialView.center;
    const nextZoom = viewport?.zoom ?? controller.initialView.zoom;

    if (
      currentZoom === nextZoom &&
      currentCenter.lat === nextLat &&
      currentCenter.lng === nextLng
    ) {
      return;
    }

    try {
      map.setView([nextLat, nextLng], nextZoom, { animate: false });
      syncViewportStateToController(readMapViewport(map), getController());
    } catch {
      // Ignore map view races during rapid controlled updates.
    }
  }, [
    controller.initialView.center,
    controller.initialView.zoom,
    getController,
    map,
    viewport,
  ]);

  useEffect(() => {
    try {
      map.invalidateSize({ animate: false });
    } catch {
      // Ignore resize races triggered by detail drawer layout changes.
    }
  }, [layoutKey, map]);

  useEffect(() => {
    map.getContainer().style.cursor = cursor ?? 'grab';
  }, [cursor, map]);

  useEffect(() => {
    if (disableDoubleClickZoom) {
      map.doubleClickZoom.disable();
    } else {
      map.doubleClickZoom.enable();
    }
  }, [disableDoubleClickZoom, map]);

  useEffect(() => {
    if (!showScale) {
      return;
    }

    // Bottom right, above the attribution, at every width: the bottom left is kept for the map's
    // summary cards, the top right holds 圖層 and the zoom buttons.
    const scaleControl = L.control.scale({
      position: 'bottomright',
      metric: true,
      imperial: false,
      maxWidth: 120,
    });

    scaleControl.addTo(map);
    return () => {
      scaleControl.remove();
    };
  }, [map, showScale]);

  useEffect(() => {
    if (!editingArea) return;
    map.closePopup();
    closeMarkerTooltips();
  }, [closeMarkerTooltips, editingArea, map]);

  useEffect(() => {
    const cellLayer = cellLayerRef.current;

    if (!cellLayer) {
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
      clickCell: clickCell,
    });
    relayoutLabels();
  }, [
    clickCell,
    controller.selectedMarkerId,
    locationCells,
    map,
    relayoutLabels,
  ]);

  useEffect(() => {
    if (!previewMarker) {
      return;
    }

    const marker = L.marker(previewMarker.position, {
      icon: createMapMarkerIcon(previewMarker, L),
      interactive: false,
    });

    marker.addTo(map);
    return () => {
      marker.remove();
    };
  }, [map, previewMarker]);

  // Keep the SVG rendered so the map can paint with its pattern.
  return (
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
          <rect width="16" height="16" fill={primitives.color.neutral.white} />
          <rect width="8" height="16" fill={color.bg.warning.default} />
        </pattern>
      </defs>
    </svg>
  );
}
