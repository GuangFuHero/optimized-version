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
 * None while the counts are not in, or with no station: the prototype draws the row only once there
 * are stations.
 */
export function stationStatTiles(
  facets: StationFacets | null,
): StatTileItem<OperationalStatus>[] | null {
  if (!facets || facets.total === 0) return null;
  const counted = new Map(
    facets.byStatus.map(({ status, count }) => [status, count]),
  );
  return [
    { key: STAT_TILE_ALL, label: '全部', count: facets.total },
    ...OPERATIONAL_STATUS_OPTIONS.map((option) => ({
      key: option.value,
      label: option.label,
      count: counted.get(option.value) ?? 0,
    })),
  ];
}
