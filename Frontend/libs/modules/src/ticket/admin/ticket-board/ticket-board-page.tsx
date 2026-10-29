'use client';

import { Box, Stack } from '@mui/material';
import {
  useTicketsExtent,
  useTicketStats,
} from '@rescue-frontend/data-access/admin';
import { designTokens } from '@rescue-frontend/ui';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { AdminListPageLayout } from '../../../admin/shared/admin-list-page-layout';
import { useNow } from '../../../admin/shared/use-now';
import { ViewSwitch, type BoardView } from '../../../admin/shared/view-switch';
import { AdminHeaderSlot } from '../../../shell/admin/header';
import { useTicketCapabilities } from './hooks/use-ticket-capabilities';
import { useTicketRows } from './hooks/use-ticket-rows';
import {
  countActiveFilters,
  EMPTY_TICKET_FILTERS,
  listsEveryTicket,
  pageCountOf,
  parseTicketFilters,
  parseTicketPage,
  TICKET_PAGE_KEYS,
  toExtentVariables,
  toPageVariables,
  writeTicketFilters,
  type TicketFilters,
} from './model/ticket-filters';
import { toTicketStats } from './model/ticket-stats';
import { TicketCreateSheet } from './ticket-create-sheet';
import type { TicketRow } from './model/ticket-row';
import { DeleteTicketConfirm, TicketDetailSheet } from './ticket-detail-sheet';
import { TicketMapView } from './ticket-map-view';
import { TicketFilterPanel } from './ticket-filter-panel';
import { TicketStatsStrip } from './ticket-stats-strip';
import { TicketTable } from './ticket-table';
import { TicketExportMenu } from './ticket-export-menu';
import { TicketImportDialog } from './ticket-import-dialog';
import { TicketToolbar } from './ticket-toolbar';
import type { SpaceHouseholdTarget } from '../space/household-input';
import { OpenSpaceButton } from '../space/open-space-button';
import { visibleSpaceRows } from '../space/space-board';
import { SpaceDetailSheet } from '../space/space-detail-sheet';
import type { TaggedSpace } from '../space/space-ticket-tag';
import { useSpaces } from '../space/use-space-data';

const { color } = designTokens;

const PAGE_HELP = '檢視並處理各地點的任務單與需求';

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
  const page = parseTicketPage(params);
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

  // One page from the server, for the table only.
  const pageVariables = useMemo(
    () => toPageVariables(filters, page),
    [filters, page],
  );
  const tickets = useTicketRows(pageVariables, {
    enabled: view === 'table',
    keepAcross: TICKET_PAGE_KEYS,
  });
  // The map counts by the extent it frames: the same query as the map's, so no second request.
  const extentVariables = useMemo(() => toExtentVariables(filters), [filters]);
  const extent = useTicketsExtent(extentVariables, {
    enabled: view === 'map',
  });
  // Unknown (loading, or failed) shows as —, never 0. Paging keeps the last page's total up while
  // the next loads; a filter change does not, as that total is the old filter's.
  const count =
    view === 'map'
      ? (extent.data?.ticketsExtent.count ?? null)
      : tickets.totalCount;
  const pageCount = pageCountOf(tickets.totalCount ?? 0);
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

  // 開啟空間 (BE-036): every space, listed and pinned beside the tickets the filters let through.
  const spaceData = useSpaces();
  const spaceRows = useMemo(
    () => visibleSpaceRows(spaceData.spaces, filters),
    [spaceData.spaces, filters],
  );
  const spaceTags = useMemo(
    () =>
      new Map<string, TaggedSpace>(
        spaceData.spaces.map((space) => [
          space.building.uuid,
          {
            name: space.building.name,
            floorLabels: space.building.floors.map((floor) => floor.label),
          },
        ]),
      ),
    [spaceData.spaces],
  );
  // The space on view lives in the URL too (?space=<uuid>); a ticket opened from it sits on top.
  const viewedSpace = params.get('space');
  const openSpace = useCallback(
    (uuid: string | null) => setParam('space', uuid),
    [setParam],
  );
  // 新增一戶 / 在這一層新增: the board's own create form, for a household in that space.
  const [household, setHousehold] = useState<{
    space: SpaceHouseholdTarget;
    floor?: string;
  } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  // 刪除任務 from a row's ⋯: the drawer's own confirm, for that row's ticket.
  const [deleting, setDeleting] = useState<TicketRow | null>(null);

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
            {/* A failed count is unknown, not zero: it shows as loading does, with its own 重試. */}
            <TicketStatsStrip
              stats={stats}
              failed={statsQuery.error != null}
              retrying={statsQuery.isFetching}
              onRetry={() => void statsQuery.refetch()}
            />
            <TicketToolbar
              caps={caps}
              query={filters.q}
              onQueryChange={(q) => setFilters({ ...filters, q })}
              activeFilterCount={countActiveFilters(filters)}
              filterOpen={filterOpen}
              onToggleFilter={() => setFilterOpen((open) => !open)}
              onClear={() => setFilters(EMPTY_TICKET_FILTERS)}
              count={count}
              spaceCount={spaceRows.length}
              moreSpaces={spaceData.moreSpaces}
              spaceControl={<OpenSpaceButton />}
              onCreate={caps.canAdd ? () => setCreating(true) : undefined}
              onImport={() => setImportOpen(true)}
              exportControl={<TicketExportMenu />}
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
                spaces={spaceRows}
                onOpenSpace={openSpace}
              />
            ) : (
              <TicketTable
                rows={tickets.rows}
                loading={tickets.isPending}
                failed={tickets.error != null}
                unfiltered={listsEveryTicket(filters)}
                retrying={tickets.isFetching}
                onRetry={() => void tickets.refetch()}
                now={now}
                page={Math.min(page, pageCount)}
                pageCount={pageCount}
                onPageChange={(next) =>
                  setParam('page', next > 1 ? String(next) : null)
                }
                onOpenTicket={openTicket}
                onDeleteTicket={setDeleting}
                onCreate={caps.canAdd ? () => setCreating(true) : undefined}
                spaces={spaceRows}
                spaceTags={spaceTags}
                onOpenSpace={openSpace}
              />
            )}
          </Box>
        }
      />
      {/* Before the ticket sheets, so a ticket opened from a space stacks over it and Esc closes
          only the ticket (design §開啟空間 6). */}
      <SpaceDetailSheet
        uuid={viewedSpace}
        onClose={() => openSpace(null)}
        onOpenTicket={openTicket}
        onAddHousehold={(space, floor) => setHousehold({ space, floor })}
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
      {deleting ? (
        <DeleteTicketConfirm
          open
          ticket={{ uuid: deleting.uuid, tasks: deleting.raw.tasks }}
          title={deleting.title}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            // The drawer on the same ticket closes with it.
            if (viewedUuid === deleting.uuid) {
              setEditingUuid(null);
              openTicket(null);
            }
            setDeleting(null);
          }}
        />
      ) : null}
      <TicketCreateSheet
        open={(creating || household !== null) && caps.canAdd}
        space={household?.space}
        initialFloor={household?.floor}
        onClose={() => {
          setCreating(false);
          setHousehold(null);
        }}
        // A household closes back to its space's floors, which refresh with it; the board's own
        // 新增任務 opens the ticket it made.
        onCreated={household ? undefined : (ticket) => openTicket(ticket.uuid)}
      />
    </>
  );
}
