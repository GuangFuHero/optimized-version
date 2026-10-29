'use client';

import { useAllStations } from '@rescue-frontend/data-access/admin';
import { useMemo } from 'react';

import {
  toServerVariables,
  type StationFilters,
} from '../model/station-filters';
import { toStationRow, type StationRow } from '../model/station-row';

const NO_ROWS: readonly StationRow[] = [];

export function useStationRows(
  filters: StationFilters,
  options: { enabled?: boolean } = {},
) {
  const query = useAllStations(toServerVariables(filters), options);
  const rows = useMemo(() => query.data?.items.map(toStationRow), [query.data]);
  return {
    rows: rows ?? NO_ROWS,
    truncated: query.data?.truncated ?? false,
    isPending: query.isPending,
  };
}
