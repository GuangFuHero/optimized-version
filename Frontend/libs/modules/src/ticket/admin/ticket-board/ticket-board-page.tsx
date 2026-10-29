'use client';

import { Box, Stack } from '@mui/material';
import { useTicketStats } from '@rescue-frontend/data-access/admin';
import { designTokens } from '@rescue-frontend/ui';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Upload } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { AdminListPageLayout } from '../../../admin/shared/admin-list-page-layout';
import { ToolbarButton } from '../../../admin/shared/toolbar-button';
import { useNow } from '../../../admin/shared/use-now';
import { ViewSwitch, type BoardView } from '../../../admin/shared/view-switch';
import { AdminHeaderSlot } from '../../../shell/admin/header';
import { useTicketCapabilities } from './hooks/use-ticket-capabilities';
import { useTicketRows } from './hooks/use-ticket-rows';
import {
  countActiveFilters,
  EMPTY_TICKET_FILTERS,
  pageCountOf,
  parseTicketFilters,
  toPageVariables,
  writeTicketFilters,
  type TicketFilters,
} from './model/ticket-filters';
import { toTicketStats } from './model/ticket-stats';
import { TicketCreateSheet } from './ticket-create-sheet';
import { TicketDetailSheet } from './ticket-detail-sheet';
import { TicketMapView } from './ticket-map-view';
import { TicketFilterPanel } from './ticket-filter-panel';
import { TicketStatsStrip } from './ticket-stats-strip';
import { TicketTable } from './ticket-table';
import { TicketExportMenu } from './ticket-export-menu';
import { TicketImportDialog } from './ticket-import-dialog';
import { TicketToolbar } from './ticket-toolbar';

const { color } = designTokens;

const PAGE_HELP = '檢視並處理民眾送來的求助單';

// The station page's frame: 12px 28px 28px around a centred 1200px column.
const FRAME_GAP = '12px';
const SECTION_SX = { px: '28px' };
const COLUMN_SX = { maxWidth: 1200, mx: 'auto', width: '100%' };

export function TicketBoardPage() {
  const router = useRouter();
  const pathname = usePathname() ?? '/tickets';
  const searchParams = useSearchParams();
  const params = useMemo(
    () => new URLSearchParams(searchParams?.toString() ?? ''),
    [searchParams],
  );
  const filters = useMemo(() => parseTicketFilters(params), [params]);
  const view: BoardView = params.get('view') === 'map' ? 'map' : 'table';
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

  // One page from the server. Loaded in the map view too: its total is the header's count.
  const pageVariables = useMemo(
    () => toPageVariables(filters, page),
    [filters, page],
  );
  const tickets = useTicketRows(pageVariables);
  const count = tickets.totalCount ?? 0;
  const pageCount = pageCountOf(count);
  // A page past the end (a pasted link, or the last ticket on it deleted) moves to the last one.
  useEffect(() => {
    if (tickets.totalCount === null || tickets.isPlaceholderData) return;
    if (page > pageCount) {
      setParam('page', pageCount > 1 ? String(pageCount) : null);
    }
  }, [
    tickets.totalCount,
    tickets.isPlaceholderData,
    page,
    pageCount,
    setParam,
  ]);
  // The stats strip counts the whole board in the caller's scope, whatever the filters.
  const statsQuery = useTicketStats();
  const stats = useMemo(
    () => (statsQuery.data ? toTicketStats(statsQuery.data.ticketStats) : null),
    [statsQuery.data],
  );
  // The ticket on view lives in the URL (?ticket=<uuid>) so links can open it.
  const openTicket = useCallback(
    (uuid: string | null) => setParam('ticket', uuid),
    [setParam],
  );
  // Mounted for any ?ticket=, in the current rows or not, so a pasted link always opens.
  const viewedUuid = params.get('ticket');
  const [editingUuid, setEditingUuid] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  return (
    <>
      <AdminHeaderSlot>
        <ViewSwitch
          count={count}
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
            <TicketStatsStrip stats={stats} />
            <TicketToolbar
              caps={caps}
              query={filters.q}
              onQueryChange={(q) => setFilters({ ...filters, q })}
              activeFilterCount={countActiveFilters(filters)}
              filterOpen={filterOpen}
              onToggleFilter={() => setFilterOpen((open) => !open)}
              onClear={() => setFilters(EMPTY_TICKET_FILTERS)}
              count={count}
              onCreate={caps.canAdd ? () => setCreating(true) : undefined}
              exportControl={<TicketExportMenu />}
              importControl={
                <ToolbarButton onClick={() => setImportOpen(true)}>
                  <Upload size={16} />
                  匯入
                </ToolbarButton>
              }
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
                filters={filters}
                selectedUuid={viewedUuid}
                onOpenTicket={openTicket}
              />
            ) : (
              <TicketTable
                rows={tickets.rows}
                loading={tickets.isPending}
                failed={tickets.error != null}
                retrying={tickets.isFetching}
                onRetry={() => {
                  void tickets.refetch();
                  if (statsQuery.error != null) void statsQuery.refetch();
                }}
                now={now}
                page={Math.min(page, pageCount)}
                pageCount={pageCount}
                onPageChange={(next) =>
                  setParam('page', next > 1 ? String(next) : null)
                }
                onOpenTicket={openTicket}
              />
            )}
          </Box>
        }
      />
      {caps.canImport && importOpen ? (
        <TicketImportDialog onClose={() => setImportOpen(false)} />
      ) : null}
      <TicketDetailSheet
        uuid={viewedUuid}
        editing={editingUuid !== null && editingUuid === viewedUuid}
        now={now}
        onClose={() => {
          setEditingUuid(null);
          openTicket(null);
        }}
        onEdit={setEditingUuid}
        onEditEnd={() => setEditingUuid(null)}
        onDeleted={() => {
          setEditingUuid(null);
          openTicket(null);
        }}
      />
      <TicketCreateSheet
        open={creating && caps.canAdd}
        onClose={() => setCreating(false)}
        onCreated={(ticket) => openTicket(ticket.uuid)}
      />
    </>
  );
}
