import type {
  RescueMapBaseLayer,
  RescueMapDataType,
  SiteModule,
  SiteSubDataTypeOption,
} from './types';
import { STATION_TYPE_OPTIONS } from '../station/type-options';
import {
  normalizeTicketStatusSelection,
  TICKET_STATUS_OPTIONS,
} from '../ticket/status';

export const SITE_FALLBACK_BASE_LAYER: RescueMapBaseLayer = 'osm-direct';
export const SITE_FALLBACK_DATA_TYPE: RescueMapDataType = 'station';

export const SITE_BASE_LAYERS: readonly RescueMapBaseLayer[] = [
  'osm-direct',
  'osm',
  'carto',
  'nasa_gibs',
  'eox',
  'nlsc',
];
export const SITE_DATA_TYPES: readonly RescueMapDataType[] = [
  'station',
  'ticket',
];

export const SITE_MODULES: readonly SiteModule[] = ['map', 'list'];

export const SITE_DATA_TYPE_LABELS: Record<RescueMapDataType, string> = {
  station: '站點',
  ticket: '任務',
};

/**
 * 各資料維度可篩選的子分類。
 * - `station` 直接使用站點類型值
 * - `ticket` 對齊後端 `tickets.status`
 */
export const SITE_SUB_DATA_TYPE_OPTIONS: Record<
  RescueMapDataType,
  readonly SiteSubDataTypeOption[]
> = {
  station: STATION_TYPE_OPTIONS,
  ticket: TICKET_STATUS_OPTIONS,
};

const STATION_SUB_DATA_TYPE_VALUES = new Set<string>(
  STATION_TYPE_OPTIONS.map((option) => option.value),
);

export function normalizeSiteSubDataTypes(
  dataType: RescueMapDataType,
  values: readonly string[] | undefined,
): string[] {
  if (!values?.length) {
    return [];
  }

  if (dataType === 'ticket') {
    return normalizeTicketStatusSelection(values);
  }

  return [
    ...new Set(
      values
        .map((value) => value.trim().toLowerCase())
        .filter((value) => STATION_SUB_DATA_TYPE_VALUES.has(value)),
    ),
  ];
}
