'use client';

import { Box } from '@mui/material';
import { designTokens } from '@rescue-frontend/ui';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAllStations } from './hooks/use-all-stations';
import { useStationCapabilities } from './hooks/use-station-capabilities';
import {
  applyClientFilters,
  countActiveFilters,
  EMPTY_FILTERS,
  parseStationFilters,
  writeStationFilters,
  type StationFilters,
} from './model/station-filters';
import { StationFilterPanel } from './station-filter-panel';
import { StationStatsStrip } from './station-stats-strip';
import { StationTable } from './station-table';
import { StationToolbar, type StationView } from './station-toolbar';

const { color } = designTokens;

function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function StationManagementPage() {
  const router = useRouter();
  const pathname = usePathname() ?? '/stations';
  const searchParams = useSearchParams();
  const params = useMemo(
    () => new URLSearchParams(searchParams?.toString() ?? ''),
    [searchParams],
  );
  const filters = useMemo(() => parseStationFilters(params), [params]);
  const view: StationView = params.get('view') === 'map' ? 'map' : 'table';
  const caps = useStationCapabilities();
  const now = useNow();
  const [filterOpen, setFilterOpen] = useState(false);

  const replaceParams = useCallback(
    (next: URLSearchParams) => {
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router],
  );
  const setFilters = useCallback(
    (next: StationFilters) => replaceParams(writeStationFilters(params, next)),
    [params, replaceParams],
  );
  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params);
      if (value) next.set(key, value);
      else next.delete(key);
      replaceParams(next);
    },
    [params, replaceParams],
  );

  const stations = useAllStations(filters);
  const unfiltered = useAllStations(EMPTY_FILTERS);
  const loadedRows = stations.data?.rows ?? [];
  const rows = useMemo(
    () => applyClientFilters(loadedRows, filters, now),
    [loadedRows, filters, now],
  );
  const pendingStationCount = (unfiltered.data?.rows ?? []).filter(
    (r) => r.pendingFieldCount > 0,
  ).length;

  const openStation = (uuid: string) => setParam('station', uuid);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        p: { xs: '16px', md: '24px' },
        minHeight: '100%',
        bgcolor: color.bg.neutral.subtle,
      }}
    >
      <StationStatsStrip
        activeStatus={filters.status}
        onSelectStatus={(status) => setFilters({ ...filters, status })}
      />
      <StationToolbar
        caps={caps}
        query={filters.q}
        onQueryChange={(q) => setFilters({ ...filters, q })}
        activeFilterCount={countActiveFilters(filters)}
        filterOpen={filterOpen}
        onToggleFilter={() => setFilterOpen((open) => !open)}
        onClear={() => setFilters(EMPTY_FILTERS)}
        count={rows.length}
        pendingStationCount={pendingStationCount}
        view={view}
        onViewChange={(next) => setParam('view', next === 'map' ? 'map' : null)}
        onOpenReview={() => undefined}
        onNew={() => undefined}
        onImport={() => undefined}
      />
      {filterOpen ? (
        <StationFilterPanel
          filters={filters}
          onChange={setFilters}
          canViewTeams={caps.canViewTeams}
        />
      ) : null}
      <StationTable
        rows={rows}
        hasAnyStation={(unfiltered.data?.rows.length ?? 0) > 0}
        loading={stations.isPending}
        truncated={stations.data?.truncated ?? false}
        now={now}
        canAdd={caps.canAdd}
        onOpenStation={openStation}
      />
    </Box>
  );
}
