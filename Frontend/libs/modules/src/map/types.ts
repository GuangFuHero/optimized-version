import type {
  InfiniteData,
  UseInfiniteQueryOptions,
} from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import type { StoreApi } from 'zustand';
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

/** A view a map opens at: a centre and a zoom. */
export interface RescueMapView {
  center: [number, number];
  zoom: number;
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

export type RescueMapViewportStoreLike = Pick<
  StoreApi<RescueMapViewportStoreSnapshot>,
  'getState' | 'getInitialState' | 'subscribe'
>;

export interface RescueMapBaseLayerConfig {
  label: string;
  description: string;
  preview: string;
  attribution: string;
  url: string;
  /** Where the backend says whose tiles they are (`/map/attribution/{type_}/{source}`). */
  attributionSource?: { type_: string; source: string };
  tileSourceType: RescueMapTileSourceType;
  tileSource: RescueMapTileSource;
  icon: LucideIcon;
  /** 授權限制提示，例如非商用或條款未確認；會顯示於圖層面板。 */
  licenseNote?: string;
  /** 暫時從圖層面板與可選清單中隱藏，但設定保留。 */
  hidden?: boolean;
  /** 圖層面板中仍顯示但不可選，並以此說明取代描述。 */
  disabledReason?: string;
  /** 上游提供的最大縮放層級；超過時放大此層級的圖磚。 */
  maxNativeZoom?: number;
}

export interface RescueMapOverlayLayerConfig {
  label: string;
  description: string;
  color: string;
  icon: LucideIcon;
  sourceLabel?: string;
  disabledReason?: string;
  /**
   * What the public site's layer panel says to someone not signed in, when the layer draws less
   * for them. The 責任區與標示區 layer draws no 責任區 for a guest (`areas` returns none), so it
   * is named and described as the 標示區 it shows, with a line saying 責任區 needs signing in.
   */
  guestLabel?: string;
  guestDescription?: string;
  guestNote?: string;
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
  /** Null when the back office gave it none. */
  name: string | null;
  comment?: string | null;
  polygons: [number, number][][][];
  /** The area the admin 互助地圖 list has picked: drawn heavier so it stands out. */
  highlighted?: boolean;
  /** Another area is picked: this one is drawn fainter (admin 互助地圖, `adminAreaStyle`). */
  dimmed?: boolean;
}

/**
 * The outline an admin is drawing on 互助地圖, before it is saved: its corners in the order they were
 * clicked, and whether it crosses itself (drawn red, and not to be finished).
 */
export interface RescueMapDraftArea {
  points: [number, number][];
  invalid: boolean;
}

/**
 * An area whose boundary an admin is changing on 互助地圖: its corners, with a handle on each to drag
 * or click away, and a plus between each two to add one. `onChange` gets the corners as they are
 * once a handle is let go; a corner is not reported while it is dragged.
 */
export interface RescueMapEditArea {
  points: [number, number][];
  invalid: boolean;
  onChange: (points: [number, number][]) => void;
}

/** A 危險區, on the 封閉區域 layer. */
export type RescueMapClosureArea = RescueMapArea;

/** A 責任區, or a 標示區 switched to public, on the 責任區與標示區 layer. */
export interface RescueMapPublicZone extends RescueMapArea {
  kind: 'team_zone' | 'mark_zone';
  /** The teams a 責任區 is assigned to; none for a 標示區. A guest gets no 責任區 at all (ADR-311 point 8). */
  teams: readonly string[];
  /** The same teams by uuid, in the same order, for the admin 互助地圖 to add and remove them by. */
  teamUuids?: readonly string[];
  /**
   * False for a 標示區 the public map does not show. Only the admin 互助地圖 asks for those
   * (`includePrivate`), and draws them dashed.
   */
  isPublic?: boolean;
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
  /**
   * A teardrop unless set. `square` marks a 開啟空間 space on the admin ticket map. On the admin
   * 互助地圖 a ticket is a `dot` (the page's subject is the areas, and a hundred drops would cover
   * them) and a station a `station`: a dark rounded square with its type's icon, a different shape
   * and not just a different colour, so the two read apart at a glance (prototype `map-canvas.jsx`).
   */
  shape?: 'drop' | 'square' | 'dot' | 'station';
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
      | 'buildingMapUuid'
      | 'contactName'
      | 'contactEmail'
      | 'contactPhone'
      | 'createdBy'
      | 'auditStatus'
      | 'suspectedDuplicateOf'
      | 'createdAt'
      | 'updatedAt'
    >
  > & {
    /** The 責任區 teams of the place, where the admin map asked for them; none = 未指派. */
    responsibleTeams?: readonly { name: string }[];
  };
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
  /**
   * An open building (開啟空間) drawn as its entry: a tap opens its floors (`Map`'s `onOpenBuilding`)
   * and selects nothing, with its counts for the entry to show (null to a guest). Absent on every
   * ticket and station.
   */
  building?: {
    uuid: string;
    ticketCount: number | null;
    shortfall: number | null;
  };
}

/**
 * Tickets that share one H3 cell, drawn as that region instead of as pins stacked on its centre
 * (every ticket in a cell comes back with the same coordinate). Built by `buildLocationCells` from
 * the markers, or from the backend's count per cell (`toLocationCells`); never part of `markers`,
 * so everything keyed on tickets and stations is unaffected.
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
  /** How many tickets the cell holds: the number written in it. */
  count: number;
  /** The tickets themselves, when they came with the cell; a counted cell reads them on opening. */
  members: readonly RescueMapMarkerItem[];
}

/** A page of the tickets one counted cell stands for (`LocationCellDetail`). */
export interface LocationCellMembersPage {
  members: readonly RescueMapMarkerItem[];
  /** How many tickets the page held, drawn as members or not: the next page starts after them. */
  read: number;
  hasMore: boolean;
}

/** The query that reads a counted cell's tickets a page at a time, each `skip` tickets in. */
export type LocationCellMembersLoader = (
  cell: string,
) => UseInfiniteQueryOptions<
  LocationCellMembersPage,
  Error,
  InfiniteData<LocationCellMembersPage, number>,
  string[],
  number
>;

/**
 * A ticket a link names that is not there: deleted, or never was (ADR-444). It holds the link's uuid
 * and the backend's word on it, and nothing of the ticket, so its drawer cannot show any.
 */
export interface RescueMapGoneTicket {
  id: string;
  detailType: 'gone-ticket';
  availability: 'deleted' | 'not_found';
}

/** What the detail drawer can show: a ticket, a station, a guest's location cell, or a gone ticket. */
export type RescueMapDetailItem =
  | RescueMapMarkerItem
  | RescueMapLocationCell
  | RescueMapGoneTicket;

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
