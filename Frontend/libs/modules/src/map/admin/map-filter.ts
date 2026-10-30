import { designTokens } from '@rescue-frontend/ui';

import {
  normalizeStationType,
  STATION_TYPE_OPTIONS,
} from '../../station/type-options';
import { matchesTicketStatusSelection } from '../../ticket/status';
import type { RescueMapMarkerItem } from '../types';

const { color } = designTokens;

/** The four priorities of a ticket, with the colour of its pin (prototype `map-filter.jsx`). */
export const ADMIN_MAP_PRIORITIES = [
  { value: 'critical', label: '生命危急', color: color.bg.danger.default },
  { value: 'high', label: '緊急', color: color.bg.warning.default },
  { value: 'medium', label: '一般', color: color.bg.info.default },
  { value: 'low', label: '低', color: color.fg.neutral.muted },
] as const;

export const ADMIN_MAP_STATUSES = [
  { value: 'pending', label: '待處理' },
  { value: 'in_progress', label: '處理中' },
  { value: 'completed', label: '已完成' },
] as const;

/** The station types, the same eleven as the rest of the app: not for this page to add to. */
export const ADMIN_MAP_STATION_TYPES = STATION_TYPE_OPTIONS;

export interface AdminMapFilters {
  /** Whole layers, each shown or hidden (MAP-ZD-201). */
  layers: { tickets: boolean; stations: boolean; areas: boolean };
  /** Each list narrows what is shown to those picked; none picked shows all. */
  priorities: readonly string[];
  statuses: readonly string[];
  stationTypes: readonly string[];
}

export const DEFAULT_ADMIN_MAP_FILTERS: AdminMapFilters = {
  layers: { tickets: true, stations: true, areas: true },
  priorities: [],
  statuses: [],
  stationTypes: [],
};

export function toggleValue(list: readonly string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}

/**
 * The markers the filters let through. A way of looking, not of choosing (MAP-ZD-128): the counts in
 * the area list are taken from all the markers, not from these.
 */
export function filterMarkers(
  markers: readonly RescueMapMarkerItem[],
  filters: AdminMapFilters,
): RescueMapMarkerItem[] {
  return markers.filter((marker) => {
    if (marker.detailType === 'ticket') {
      const priority = marker.ticketMeta?.priority?.trim().toLowerCase();

      return (
        filters.layers.tickets &&
        (filters.priorities.length === 0 ||
          (priority !== undefined && filters.priorities.includes(priority))) &&
        matchesTicketStatusSelection(
          marker.ticketMeta?.status,
          filters.statuses,
        )
      );
    }

    const type = normalizeStationType(marker.stationMeta?.type);

    return (
      filters.layers.stations &&
      (filters.stationTypes.length === 0 ||
        (type !== undefined && filters.stationTypes.includes(type)))
    );
  });
}

/** How many of the three lists have a pick in them, for the badge on the button. */
export function activeFilterCount(filters: AdminMapFilters): number {
  return (
    filters.priorities.length +
    filters.statuses.length +
    filters.stationTypes.length
  );
}

/** Whether the filters hide anything: a picked value, or a layer turned off. */
export function isFiltering(filters: AdminMapFilters): boolean {
  return (
    activeFilterCount(filters) > 0 ||
    !filters.layers.tickets ||
    !filters.layers.stations ||
    !filters.layers.areas
  );
}
