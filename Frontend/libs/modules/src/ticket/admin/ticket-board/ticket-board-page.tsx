'use client';

import { Box, Stack } from '@mui/material';
import { designTokens } from '@rescue-frontend/ui';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { AdminListPageLayout } from '../../../admin/shared/admin-list-page-layout';
import { AdminHeaderSlot } from '../../../shell/admin/header';
import {
  StationViewSwitch,
  type StationView,
} from '../../../station/admin/station-management/station-toolbar';
import { useTicketCapabilities } from './hooks/use-ticket-capabilities';
import { useTicketRows } from './hooks/use-ticket-rows';
import {
  applyClientFilters,
  countActiveFilters,
  EMPTY_TICKET_FILTERS,
  parseTicketFilters,
  writeTicketFilters,
  type TicketFilters,
} from './model/ticket-filters';
import { ticketStats } from './model/ticket-stats';
import { TicketMapView } from './ticket-map-view';
import { TicketFilterPanel } from './ticket-filter-panel';
import { TicketStatsStrip } from './ticket-stats-strip';
import { TicketTable } from './ticket-table';
import { TicketToolbar } from './ticket-toolbar';

const { color } = designTokens;

const PAGE_HELP = '檢視並處理民眾送來的求助單';

// The station page's frame: 12px 28px 28px around a centred 1200px column.
const FRAME_GAP = '12px';
const SECTION_SX = { px: '28px' };
const COLUMN_SX = { maxWidth: 1200, mx: 'auto', width: '100%' };

function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function TicketBoardPage() {
  const router = useRouter();
  const pathname = usePathname() ?? '/tickets';
  const searchParams = useSearchParams();
  const params = useMemo(
    () => new URLSearchParams(searchParams?.toString() ?? ''),
    [searchParams],
  );
  const filters = useMemo(() => parseTicketFilters(params), [params]);
  const view: StationView = params.get('view') === 'map' ? 'map' : 'table';
  const page = Number(params.get('page')) || 1;
  const caps = useTicketCapabilities();
  const now = useNow();
  const [filterOpen, setFilterOpen] = useState(false);

  const replaceParams = useCallback(
    (next: URLSearchParams) => {
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router],
  );
  const setFilters = useCallback(
    (next: TicketFilters) => replaceParams(writeTicketFilters(params, next)),
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

  const tickets = useTicketRows(filters);
  // The stats strip counts the whole board, whatever the filters.
  const unfiltered = useTicketRows(EMPTY_TICKET_FILTERS);
  const loadedRows = tickets.rows;
  const rows = useMemo(
    () => applyClientFilters(loadedRows, filters),
    [loadedRows, filters],
  );
  const stats = useMemo(() => ticketStats(unfiltered.rows), [unfiltered.rows]);
  // The ticket on view lives in the URL (?ticket=<uuid>) so links can open it.
  const openTicket = (uuid: string | null) => setParam('ticket', uuid);

  return (
    <>
      <AdminHeaderSlot>
        <StationViewSwitch
          count={rows.length}
          view={view}
          help={PAGE_HELP}
          onChange={(next) => setParam('view', next === 'map' ? 'map' : null)}
        />
      </AdminHeaderSlot>
      <AdminListPageLayout
        canvasColor={color.bg.neutral.subtle}
        header={
          <Stack
            sx={{
              ...SECTION_SX,
              pt: FRAME_GAP,
              pb: FRAME_GAP,
              gap: FRAME_GAP,
              '& > *': COLUMN_SX,
            }}
          >
            {/* A failed count is unknown, not zero: it shows as loading does. */}
            <TicketStatsStrip
              stats={stats}
              loading={unfiltered.isPending || unfiltered.error != null}
            />
            <TicketToolbar
              caps={caps}
              query={filters.q}
              onQueryChange={(q) => setFilters({ ...filters, q })}
              activeFilterCount={countActiveFilters(filters)}
              filterOpen={filterOpen}
              onToggleFilter={() => setFilterOpen((open) => !open)}
              onClear={() => setFilters(EMPTY_TICKET_FILTERS)}
              count={rows.length}
            />
          </Stack>
        }
        filterPanel={
          filterOpen ? (
            <Box sx={COLUMN_SX}>
              <TicketFilterPanel filters={filters} onChange={setFilters} />
            </Box>
          ) : undefined
        }
        filterPanelSx={{ ...SECTION_SX, pb: FRAME_GAP }}
        listContainerSx={{ ...SECTION_SX, pb: '28px' }}
        list={
          <Box sx={COLUMN_SX}>
            {view === 'map' ? (
              <TicketMapView
                rows={rows}
                selectedUuid={params.get('ticket')}
                onOpenTicket={openTicket}
              />
            ) : (
              <TicketTable
                rows={rows}
                loading={tickets.isPending}
                truncated={tickets.truncated}
                failed={tickets.error != null}
                retrying={tickets.isFetching}
                onRetry={() => {
                  void tickets.refetch();
                  if (unfiltered.error != null) void unfiltered.refetch();
                }}
                now={now}
                page={page}
                onPageChange={(next) =>
                  setParam('page', next > 1 ? String(next) : null)
                }
                onOpenTicket={openTicket}
              />
            )}
          </Box>
        }
      />
    </>
  );
}
