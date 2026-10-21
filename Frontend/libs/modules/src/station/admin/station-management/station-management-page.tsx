'use client';

import { Box, Stack } from '@mui/material';
import {
  useDeleteStation,
  useProjectSettings,
} from '@rescue-frontend/data-access/admin';
import { designTokens, Dialog } from '@rescue-frontend/ui';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { AdminListPageLayout } from '../../../admin/shared/admin-list-page-layout';
import { AdminHeaderSlot } from '../../../shell/admin/header';
import { StationFormDrawer, type StationFormTarget } from '../station-form';
import { useStationRows } from './hooks/use-station-rows';
import { useStationCapabilities } from './hooks/use-station-capabilities';
import {
  applyClientFilters,
  areaOptions,
  countActiveFilters,
  EMPTY_FILTERS,
  parseStationFilters,
  writeStationFilters,
  type StationFilters,
} from './model/station-filters';
import { ReviewQueueDialog } from './review-queue-dialog';
import { StationDetailSheet } from './station-detail-sheet';
import { StationExportMenu } from './station-export-menu';
import { StationFilterPanel } from './station-filter-panel';
import { StationImportDialog } from './station-import-dialog';
import { StationMapView } from './station-map-view';
import { QuickStatusCell, TeamAssignCell } from './station-row-controls';
import { StationTable } from './station-table';
import {
  StationToolbar,
  StationViewSwitch,
  type StationView,
} from './station-toolbar';

const { color } = designTokens;

// The prototype's frame (wg-shell + station-app): 12px 28px 28px around a centred 1200px column,
// with 12px between the toolbar, filter panel and list.
const FRAME_GAP = '12px';
const SECTION_SX = { px: '28px' };
const COLUMN_SX = { maxWidth: 1200, mx: 'auto', width: '100%' };

const PENDING_FILTERS: StationFilters = { ...EMPTY_FILTERS, pending: true };

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
  const [reviewOpen, setReviewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

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

  const stations = useStationRows(filters);
  const unfiltered = useStationRows(EMPTY_FILTERS);
  const loadedRows = stations.rows;
  const disasterStartedAt = useProjectSettings().data?.started_at ?? null;
  const rows = useMemo(
    () => applyClientFilters(loadedRows, filters, now, disasterStartedAt),
    [loadedRows, filters, now, disasterStartedAt],
  );
  // The review queue's own query: it also counts stations whose only suggestions are on their
  // resources, which pendingSuggestedFields (station fields only) leaves out.
  const reviewQueue = useStationRows(PENDING_FILTERS, {
    enabled: caps.canReview,
  });
  const pendingStationCount = caps.canReview ? reviewQueue.rows.length : 0;

  const hasAnyStation = unfiltered.rows.length > 0;
  const areas = useMemo(() => areaOptions(unfiltered.rows), [unfiltered.rows]);
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
  // The station on view lives in the URL (?station=<uuid>) so notifications can link to it. The
  // station's edit form replaces its details in the same drawer, so cancelling an edit lands back
  // on the station being edited.
  const viewedUuid = params.get('station');
  const [formTarget, setFormTarget] = useState<StationFormTarget | null>(null);
  const deleteStation = useDeleteStation();
  const [pendingDelete, setPendingDelete] = useState<{
    uuid: string;
    name: string;
  } | null>(null);
  const openStation = (uuid: string | null) => setParam('station', uuid);
  const openNew = (position?: [number, number]) =>
    setFormTarget({ mode: 'create', position });
  const editStation = (uuid: string) => {
    openStation(uuid);
    setFormTarget({ mode: 'edit', uuid });
  };
  const emptyStateNew = caps.canAdd ? () => openNew() : undefined;
  const emptyStateImport = caps.canImport
    ? () => setImportOpen(true)
    : undefined;

  return (
    <>
      <AdminHeaderSlot>
        <StationViewSwitch
          count={rows.length}
          view={view}
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
              onOpenReview={() => setReviewOpen(true)}
              onNew={() => openNew()}
              onImport={() => setImportOpen(true)}
              exportControl={<StationExportMenu />}
            />
          </Stack>
        }
        filterPanel={
          filterOpen ? (
            <Box sx={COLUMN_SX}>
              <StationFilterPanel
                filters={filters}
                onChange={setFilters}
                canViewTeams={caps.canViewTeams}
                areas={areas}
                canFilterEstablished={disasterStartedAt !== null}
              />
            </Box>
          ) : undefined
        }
        filterPanelSx={{ ...SECTION_SX, pb: FRAME_GAP }}
        listContainerSx={{ ...SECTION_SX, pb: '28px' }}
        list={
          <Box sx={COLUMN_SX}>
            {view === 'map' ? (
              <StationMapView
                rows={rows}
                hasAnyStation={hasAnyStation}
                now={now}
                selectedUuid={selectedUuid}
                onSelect={setSelectedUuid}
                onOpenStation={openStation}
                onAddAt={
                  caps.canAdd ? (position) => openNew(position) : undefined
                }
                onNew={emptyStateNew}
                onImport={emptyStateImport}
              />
            ) : (
              <StationTable
                rows={rows}
                hasAnyStation={hasAnyStation}
                loading={stations.isPending}
                truncated={stations.truncated}
                now={now}
                onNew={emptyStateNew}
                onImport={emptyStateImport}
                onOpenStation={openStation}
                renderStatus={
                  caps.canEdit
                    ? (row) => <QuickStatusCell row={row} />
                    : undefined
                }
                renderTeam={
                  caps.canAssign && caps.canViewTeams
                    ? (row) => <TeamAssignCell row={row} />
                    : undefined
                }
              />
            )}
          </Box>
        }
      />
      <StationDetailSheet
        uuid={viewedUuid}
        editing={formTarget?.mode === 'edit' && formTarget.uuid === viewedUuid}
        caps={caps}
        now={now}
        onClose={() => {
          setFormTarget(null);
          openStation(null);
        }}
        onEdit={editStation}
        onEditEnd={() => setFormTarget(null)}
        onDelete={(uuid, name) => setPendingDelete({ uuid, name })}
      />
      <StationFormDrawer
        target={formTarget?.mode === 'create' ? formTarget : null}
        variant="admin"
        canViewPii={caps.canViewPii}
        onClose={() => setFormTarget(null)}
        onSaved={(station) => {
          setFormTarget(null);
          openStation(station.uuid);
        }}
      />
      {caps.canReview && reviewOpen ? (
        <ReviewQueueDialog
          open
          canEdit={caps.canEdit}
          canViewHistory={caps.canViewHistory}
          onClose={() => setReviewOpen(false)}
          onEditStation={(uuid) => {
            setReviewOpen(false);
            editStation(uuid);
          }}
        />
      ) : null}
      {caps.canImport && importOpen ? (
        <StationImportDialog onClose={() => setImportOpen(false)} />
      ) : null}
      <Dialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return;
          deleteStation.mutate(
            { uuid: pendingDelete.uuid },
            {
              onSuccess: () => {
                toast('已刪除站點');
                setPendingDelete(null);
                openStation(null);
              },
            },
          );
        }}
        title="刪除站點？"
        confirmLabel="刪除"
        confirmTone="danger"
        submitting={deleteStation.isPending}
      >
        「{pendingDelete?.name || '這個站點'}
        」會從列表與前台地圖移除。目前系統沒有還原功能。
      </Dialog>
    </>
  );
}
