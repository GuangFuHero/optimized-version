import AltRouteOutlinedIcon from '@mui/icons-material/AltRouteOutlined';
import DoNotDisturbAltOutlinedIcon from '@mui/icons-material/DoNotDisturbAltOutlined';
import FmdGoodOutlinedIcon from '@mui/icons-material/FmdGoodOutlined';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import SatelliteAltOutlinedIcon from '@mui/icons-material/SatelliteAltOutlined';
import { designTokens } from '@rescue-frontend/ui';

import type {
  RescueMapBaseLayer,
  RescueMapBaseLayerConfig,
  RescueMapOverlayLayer,
  RescueMapOverlayLayerConfig,
} from './types';

const { color, primitives } = designTokens;

/**
 * Basemap swatches are pictures of terrain, not UI surfaces, so they reach the raw green ramp
 * rather than a semantic token — the design system has no `bg.terrain`, and inventing one for a
 * 40px thumbnail would put a colour in the palette that no interface element ever uses.
 */
const TERRAIN_PREVIEW = `linear-gradient(135deg, ${primitives.color.green[500]} 0%, ${primitives.color.green[700]} 100%)`;
const STREET_PREVIEW = `linear-gradient(135deg, ${color.bg.neutral.sunken} 0%, ${color.border.default} 100%)`;

export const RESCUE_MAP_INITIAL_VIEW: {
  center: [number, number];
  zoom: number;
} = {
  center: [23.884, 121.0],
  zoom: 13,
};

export const RESCUE_MAP_DESKTOP_DETAIL_DRAWER_WIDTH = 352;

export const BASE_LAYER_CONFIG: Record<
  RescueMapBaseLayer,
  RescueMapBaseLayerConfig
> = {
  'osm-direct': {
    label: 'OSM 標準街道圖',
    description: '',
    preview: STREET_PREVIEW,
    attribution: '&copy; OpenStreetMap contributors',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    tileSourceType: 'road',
    tileSource: 'osm-direct',
    icon: MapOutlinedIcon,
  },
  carto: {
    label: '街道地圖',
    description: 'CARTO 淺色底圖，適合查看道路與聚落位置',
    preview: STREET_PREVIEW,
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    attributionApiPath: '/api/map/attribution/road/carto',
    url: '/api/map/tile/road/carto/{z}/{x}/{y}',
    tileSourceType: 'road',
    tileSource: 'carto',
    icon: MapOutlinedIcon,
  },
  osm: {
    label: 'OSM 標準街道圖',
    description: '快取資源',
    preview: STREET_PREVIEW,
    attribution: '&copy; OpenStreetMap contributors',
    attributionApiPath: '/api/map/attribution/road/osm',
    url: '/api/map/tile/road/osm/{z}/{x}/{y}',
    tileSourceType: 'road',
    tileSource: 'osm',
    icon: MapOutlinedIcon,
  },
  eox: {
    label: '衛星影像（EOX）',
    description: '適合觀察地形與現地狀況',
    preview: TERRAIN_PREVIEW,
    attribution:
      '&copy; EOX IT Services GmbH, contains modified Copernicus Sentinel data',
    attributionApiPath: '/api/map/attribution/satellite/eox',
    url: '/api/map/tile/satellite/eox/{z}/{x}/{y}',
    tileSourceType: 'satellite',
    tileSource: 'eox',
    icon: SatelliteAltOutlinedIcon,
    licenseNote: '僅限非商業用途（CC BY-NC-SA 4.0）',
  },
  nasa_gibs: {
    label: '衛星影像（NASA GIBS）',
    description: 'NASA MODIS 真實色彩衛星影像',
    preview: TERRAIN_PREVIEW,
    attribution: '&copy; NASA EOSDIS GIBS',
    attributionApiPath: '/api/map/attribution/satellite/nasa_gibs',
    url: '/api/map/tile/satellite/nasa_gibs/{z}/{x}/{y}',
    tileSourceType: 'satellite',
    tileSource: 'nasa_gibs',
    icon: SatelliteAltOutlinedIcon,
  },
  nlsc: {
    label: '衛星影像（國土測繪中心）',
    description: '內政部國土測繪中心混合正射影像',
    preview: TERRAIN_PREVIEW,
    attribution: '&copy; 內政部國土測繪中心',
    attributionApiPath: '/api/map/attribution/satellite/nlsc',
    url: '/api/map/tile/satellite/nlsc/{z}/{x}/{y}',
    tileSourceType: 'satellite',
    tileSource: 'nlsc',
    icon: SatelliteAltOutlinedIcon,
    licenseNote: '禁止非商業再散布',
  },
  sinica: {
    label: '衛星影像（中研院）',
    description: '中央研究院 GIS 衛星影像',
    preview: TERRAIN_PREVIEW,
    attribution: '&copy; 中央研究院',
    attributionApiPath: '/api/map/attribution/satellite/sinica',
    url: '/api/map/tile/satellite/sinica/{z}/{x}/{y}?layer=TAIWAN_MOSAIC',
    tileSourceType: 'satellite',
    tileSource: 'sinica',
    icon: SatelliteAltOutlinedIcon,
    licenseNote: '使用條款未確認，正式環境前需向中研院確認授權',
    hidden: true,
  },
};

export const RESCUE_MAP_OVERLAY_LAYER_ORDER: readonly RescueMapOverlayLayer[] =
  ['closure-areas', 'routes', 'secondary-locations'];

export const DEFAULT_RESCUE_MAP_OVERLAY_LAYERS: readonly RescueMapOverlayLayer[] =
  ['closure-areas'];

export const OVERLAY_LAYER_CONFIG: Record<
  RescueMapOverlayLayer,
  RescueMapOverlayLayerConfig
> = {
  'closure-areas': {
    label: '封閉區域',
    description: '危險地帶與暫時封鎖範圍',
    // `fg.warning` is scoped to the warning-subtle fill; on this panel's white surface it is
    // 3.79:1. The orange-family text token that survives a white background is the primary
    // subtle tone (5.90:1), and closure areas are warm-toned either way.
    color: color.brand.primary.subtle,
    icon: DoNotDisturbAltOutlinedIcon,
    sourceLabel: 'closure_areas.geometry via base_geometries',
  },
  routes: {
    label: '路線',
    description: '巡查路線與任務動線',
    // Rendered as label text in the layer panel, so it takes the subtle tone: the default blue
    // measures 3.56:1 on the panel's white surface.
    color: color.brand.secondary.subtle,
    icon: AltRouteOutlinedIcon,
    sourceLabel: 'routes via base_geometries',
    disabledReason: '尚無資料',
  },
  'secondary-locations': {
    label: '次要位置',
    description: '地址與電線桿等輔助位置資訊',
    color: color.fg.success,
    icon: FmdGoodOutlinedIcon,
    sourceLabel: 'secondary_locations via base_geometries',
    disabledReason: '尚無資料',
  },
};
