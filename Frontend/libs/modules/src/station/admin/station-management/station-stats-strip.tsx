'use client';

import { useStationFacets } from '@rescue-frontend/data-access/admin';

import { STAT_TILE_ALL } from '../../../admin/shared/model/stat-tiles';
import { StatTiles } from '../../../admin/shared/stat-tiles';
import type { OperationalStatus } from '../../operational-status';
import { stationStatTiles } from './model/station-stats';

interface StationStatsStripProps {
  /** The page's operational status filter, the same one the filter panel sets (STAT-103). */
  status: OperationalStatus | null;
  onStatusChange: (status: OperationalStatus | null) => void;
}

/**
 * The stations' counts by operational status, each a filter on it (prototype station-table.jsx).
 * Counted over every station in scope, whatever the filters; a count that did not load reads —.
 */
export function StationStatsStrip({
  status,
  onStatusChange,
}: StationStatsStripProps) {
  const facets = useStationFacets();

  return (
    <StatTiles
      items={stationStatTiles(facets.data?.stationFacets ?? null)}
      value={status ?? STAT_TILE_ALL}
      onChange={(next) =>
        onStatusChange(
          next === STAT_TILE_ALL ? null : (next as OperationalStatus),
        )
      }
    />
  );
}
