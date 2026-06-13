import type { ElementType } from 'react';

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
  icon: ElementType;
  /** 授權限制提示，例如非商用或條款未確認；會顯示於圖層面板。 */
  licenseNote?: string;
  /** 暫時從圖層面板與可選清單中隱藏，但設定保留。 */
  hidden?: boolean;
}

export interface RescueMapOverlayLayerConfig {
  label: string;
  description: string;
  color: string;
  icon: ElementType;
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

export interface RescueMapMarkerItem {
  id: string;
  title: string;
  subtitle: string;
  position: [number, number];
  label: string;
  variant: RescueMapMarkerVariant;
  detailType: 'ticket' | 'station';
  stationMeta?: {
    type?: string | null;
    name?: string | null;
    description?: string | null;
    opHour?: string | null;
    level?: number | null;
    comment?: string | null;
    source?: string | null;
    visibility?: string | null;
    verificationStatus?: string | null;
    confidenceScore?: number | null;
    isDuplicate?: boolean;
    isTemporary?: boolean;
    isOfficial?: boolean;
    priorityScore?: number | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  };
  ticketMeta?: {
    status?: string | null;
    priority?: string | null;
    taskType?: string | null;
    contactName?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    createdBy?: string | null;
    visibility?: string | null;
    verificationStatus?: string | null;
    reviewNote?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  };
  /** 任務媒合所需志工數；僅任務 marker 使用。 */
  requiredVolunteers?: number;
  /** 初始已媒合志工數；使用者操作後以前臺本地狀態為準。 */
  matchedVolunteers?: number;
}

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
