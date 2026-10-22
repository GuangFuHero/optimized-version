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
  | 'public-zones'
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

/** An area drawn on the back office's 互助地圖, as the public map shows it (backend `areas`, ADR-311). */
export interface RescueMapArea {
  id: string;
  /** Its name, or its kind's (危險區, 責任區, 標示區) when it has none. */
  label: string;
  comment?: string | null;
  polygons: [number, number][][][];
}

/** A 危險區, on the 封閉區域 layer. */
export type RescueMapClosureArea = RescueMapArea;

/** A 責任區, or a 標示區 switched to public, on the 責任區與標示區 layer. */
export interface RescueMapPublicZone extends RescueMapArea {
  kind: 'team_zone' | 'mark_zone';
  /** The teams a 責任區 is assigned to, public since ADR-311's 10-11 revision; none for a 標示區. */
  teams: readonly string[];
}

export interface RescueMapOverlayLayerMeta {
  itemCount: number;
  sourceLabel?: string;
}

export interface RescueMapLayerPreferences {
  baseLayer?: RescueMapBaseLayer;
  enabledOverlayLayers?: RescueMapOverlayLayer[];
  /** The overlay layers there were when these were saved. One added since starts as its default. */
  knownOverlayLayers?: RescueMapOverlayLayer[];
}

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
      | 'supplyStatus'
      | 'supplyStatusUpdatedAt'
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
  publicZones: RescueMapPublicZone[];
  overlayLayerMeta: Partial<
    Record<RescueMapOverlayLayer, RescueMapOverlayLayerMeta>
  >;
  tileLayer: RescueMapBaseLayerConfig;
  initialView: {
    center: [number, number];
    zoom: number;
  };
}
