import type { AdminStationFacetsQuery } from '@rescue-frontend/data-access/admin';

import {
  STAT_TILE_ALL,
  type StatTileItem,
} from '../../../../admin/shared/model/stat-tiles';
import { OPERATIONAL_STATUS_OPTIONS } from '../../../operational-status';

type StationFacets = Pick<
  AdminStationFacetsQuery['stationFacets'],
  'total' | 'byStatus'
>;

/**
 * The stations page's tiles (prototype station-table.jsx): 全部 and each operational status, from
 * `stationFacets` read with no filter, so they count every station in the caller's scope (STAT-102).
 * Null while the counts are not in: every tile reads —.
 */
export function stationStatTiles(facets: StationFacets | null): StatTileItem[] {
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
