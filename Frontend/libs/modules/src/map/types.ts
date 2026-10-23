import type { LucideIcon } from 'lucide-react';
import type {
  StationType,
  TicketType,
} from '@rescue-frontend/data-access/admin';

import type { TicketNeed } from '../ticket/needs/need-claim';

export type RescueMapMarkerVariant =
  | 'urgent-ticket'
  | 'in-progress'
  | 'resource-station'
  | 'pinned-location';

export type RescueMapBaseLayer =
  | 'osm-direct'
  | 'osm'
  | 'carto'
  | 'nasa_gibs'
  | 'eox'
  | 'nlsc'
  | 'sinica';
export type RescueMapTileSourceType = 'road' | 'satellite';
export type RescueMapTileSource = RescueMapBaseLayer;

export type RescueMapDataType = 'station' | 'ticket';

export type RescueMapOverlayLayer =
  | 'closure-areas'
  | 'routes'
  | 'secondary-locations';

export type RescueMapBoundingBox = [number, number, number, number];

export interface RescueMapViewportState {
  center: [number, number];
  zoom?: number;
}

export interface RescueMapRouteState {
  baseLayer?: RescueMapBaseLayer;
  dataType?: RescueMapDataType;
  subDataTypes?: readonly string[];
  selectedMarkerId?: string;
  bbox?: RescueMapBoundingBox;
  position?: RescueMapViewportState;
  search?: string;
}

export interface RescueMapViewportStoreSnapshot {
  position?: RescueMapViewportState;
  bbox?: RescueMapBoundingBox;
}

/** A point picked on the map, held until it is used or let go (`Map`'s `draftPoint`). */
export interface RescueMapDraftPoint {
  lat: number;
  lng: number;
}

export interface RescueMapViewportStoreLike {
  getSnapshot: () => RescueMapViewportStoreSnapshot;
  subscribe: (listener: () => void) => () => void;
}

export interface RescueMapBaseLayerConfig {
  label: string;
  description: string;
  preview: string;
  attribution: string;
  url: string;
  attributionApiPath?: string;
  tileSourceType: RescueMapTileSourceType;
  tileSource: RescueMapTileSource;
  icon: LucideIcon;
  /** 授權限制提示，例如非商用或條款未確認；會顯示於圖層面板。 */
  licenseNote?: string;
  /** 暫時從圖層面板與可選清單中隱藏，但設定保留。 */
  hidden?: boolean;
}

export interface RescueMapOverlayLayerConfig {
  label: string;
  description: string;
  color: string;
  icon: LucideIcon;
  sourceLabel?: string;
  disabledReason?: string;
}

export interface RescueMapTaskHeatZone {
  id: string;
  label: string;
  center: [number, number];
  radius: number;
  intensity: 'high' | 'medium';
}

export interface RescueMapAdministrativeArea {
  id: string;
  label: string;
  points: [number, number][];
}

export interface RescueMapClosureArea {
  id: string;
  label: string;
  status: string;
  informationSource?: string | null;
  comment?: string | null;
  polygons: [number, number][][][];
}

export interface RescueMapOverlayLayerMeta {
  itemCount: number;
  sourceLabel?: string;
}

export interface RescueMapLayerPreferences {
  baseLayer?: RescueMapBaseLayer;
  enabledOverlayLayers?: RescueMapOverlayLayer[];
}

/**
 * Opt-in look for a marker: a small teardrop pin in a colour of the caller's choosing, with no
 * label. Markers without it keep the default round pin and label pill.
 */
export interface RescueMapPinAppearance {
  /** Any CSS colour. */
  color: string;
  /** Faded, e.g. for a closed station. */
  dimmed?: boolean;
  /** Outlined, enlarged and lifted above the other pins. */
  selected?: boolean;
}

/** Opt-in hover tooltip for a marker. Plain text; it is escaped. */
export interface RescueMapMarkerTooltip {
  title: string;
  subtitle?: string;
}

/** Opt-in cluster look: `solid` is a flat primary disc in a white ring (admin station map). */
export type RescueMapClusterAppearance = 'default' | 'solid';

export interface RescueMapMarkerItem {
  id: string;
  title: string;
  subtitle: string;
  position: [number, number];
  label: string;
  variant: RescueMapMarkerVariant;
  detailType: 'ticket' | 'station';
  /**
   * H3 cell index when `position` is only the centre of a region — the viewer may not see where
   * exactly this ticket is (backend ADR-281). Null/absent means `position` is the real point.
   */
  locationCell?: string | null;
  stationMeta?: Partial<
    Pick<
      StationType,
      | 'type'
      | 'name'
      | 'description'
      | 'opHour'
      | 'level'
      | 'comment'
      | 'source'
      | 'visibility'
      | 'verificationStatus'
      | 'isDuplicate'
      | 'isTemporary'
      | 'isOfficial'
      | 'operationalStatus'
      | 'createdAt'
      | 'updatedAt'
    >
  >;
  ticketMeta?: Partial<
    Pick<
      TicketType,
      | 'status'
      | 'priority'
      | 'taskType'
      | 'contactName'
      | 'contactEmail'
      | 'contactPhone'
      | 'createdBy'
      | 'auditStatus'
      | 'createdAt'
      | 'updatedAt'
    >
  >;
  /**
   * The ticket's needs, each with its own claim button. Only the site list fetches them
   * (`GetTicketsWithNeeds`); a map marker has none, as its popup offers no claiming.
   */
  needs?: readonly TicketNeed[];
  /** 任務媒合所需志工數；僅任務 marker 使用。 */
  requiredVolunteers?: number;
  /** 初始已媒合志工數；使用者操作後以前臺本地狀態為準。 */
  matchedVolunteers?: number;
  /** Draws a teardrop pin instead of the default marker. Absent: the default marker. */
  pin?: RescueMapPinAppearance;
  /** Shown on hover. Absent: no tooltip. */
  tooltip?: RescueMapMarkerTooltip;
}

/**
 * Tickets that share one H3 cell, drawn as that region instead of as pins stacked on its centre
 * (every ticket in a cell comes back with the same coordinate). Built by `buildLocationCells`;
 * never part of `markers`, so everything keyed on tickets and stations is unaffected.
 */
export interface RescueMapLocationCell {
  /** `cell:<H3 index>` — selectable like a marker id, never colliding with a uuid. */
  id: string;
  /** The H3 index itself. */
  cell: string;
  detailType: 'cell';
  position: [number, number];
  /** The most urgent member decides the colour, as with a cluster. */
  variant: Extract<RescueMapMarkerVariant, 'urgent-ticket' | 'in-progress'>;
  members: readonly RescueMapMarkerItem[];
}

/** What the detail drawer can show: a ticket, a station, or a guest's location cell. */
export type RescueMapDetailItem = RescueMapMarkerItem | RescueMapLocationCell;

export interface RescueMapControllerValue {
  baseLayer: RescueMapBaseLayer;
  setBaseLayer: (layer: RescueMapBaseLayer) => void;
  dataType?: RescueMapDataType;
  setDataType: (dataType: RescueMapDataType) => void;
  subDataTypes: readonly string[];
  toggleSubDataType: (value: string) => void;
  enabledOverlayLayers: readonly RescueMapOverlayLayer[];
  toggleOverlayLayer: (layer: RescueMapOverlayLayer) => void;
  selectedMarkerId?: string;
  setSelectedMarkerId: (markerId: string | undefined) => void;
  setViewportState: (next: {
    center: [number, number];
    zoom: number;
    bbox: RescueMapBoundingBox;
  }) => void;
  layerPanelOpen: boolean;
  openLayerPanel: () => void;
  closeLayerPanel: () => void;
  markers: RescueMapMarkerItem[];
  closureAreas: RescueMapClosureArea[];
  overlayLayerMeta: Partial<
    Record<RescueMapOverlayLayer, RescueMapOverlayLayerMeta>
  >;
  tileLayer: RescueMapBaseLayerConfig;
  initialView: {
    center: [number, number];
    zoom: number;
  };
}
