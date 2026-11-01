'use client';

import { Box } from '@mui/material';
import { useStationFacets } from '@rescue-frontend/data-access/admin';

import { statCountsFailed } from '../../../admin/shared/model/stat-tiles';
import { StatTiles, StatTilesRetry } from '../../../admin/shared/stat-tiles';
import type { OperationalStatus } from '../../operational-status';
import { stationStatTiles } from './model/station-stats';

interface StationStatsStripProps {
  /** The page's operational status filter, the same one the filter panel sets (STAT-103). */
  status: OperationalStatus | null;
  onStatusChange: (status: OperationalStatus | null) => void;
}

/**
 * The stations' counts by operational status, each a filter on it (prototype station-table.jsx).
 * Counted over every station in scope, whatever the filters; a count not in reads — (STAT-108).
 * Counts that did not load get their own 重試, as the 任務管理 row does.
 */
export function StationStatsStrip({
  status,
  onStatusChange,
}: StationStatsStripProps) {
  const facets = useStationFacets();
  const failed = statCountsFailed(facets);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {failed ? (
        <StatTilesRetry
          retrying={facets.isFetching}
          onRetry={() => void facets.refetch()}
        />
      ) : null}
      <StatTiles
        items={stationStatTiles(facets.data?.stationFacets ?? null)}
        value={status}
        onChange={onStatusChange}
      />
    </Box>
  );
}
