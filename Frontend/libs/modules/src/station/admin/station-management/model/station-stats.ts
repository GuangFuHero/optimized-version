import type { AdminStationFacetsQuery } from '@rescue-frontend/data-access/admin';

import {
  STAT_TILE_ALL,
  type StatTileItem,
} from '../../../../admin/shared/model/stat-tiles';
import {
  OPERATIONAL_STATUS_OPTIONS,
  type OperationalStatus,
} from '../../../operational-status';

type StationFacets = Pick<
  AdminStationFacetsQuery['stationFacets'],
  'total' | 'byStatus'
>;

/**
 * The stations page's tiles (prototype station-table.jsx): 全部 and each operational status, from
 * `stationFacets` read with no filter, so they count every station in the caller's scope (STAT-102).
 * The row shows while the counts are not in, every tile reading — (STAT-108), and with no station.
 */
export function stationStatTiles(
  facets: StationFacets | null,
): StatTileItem<OperationalStatus>[] {
  const counted = new Map(
    (facets?.byStatus ?? []).map(({ status, count }) => [status, count]),
  );
  return [
    { key: STAT_TILE_ALL, label: '全部', count: facets?.total ?? null },
    ...OPERATIONAL_STATUS_OPTIONS.map((option) => ({
      key: option.value,
      label: option.label,
      count: facets ? (counted.get(option.value) ?? 0) : null,
    })),
  ];
}
