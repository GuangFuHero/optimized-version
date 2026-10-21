'use client';

import { Stack } from '@mui/material';
import { useDeleteStation } from '@rescue-frontend/data-access/admin';
import { designTokens, Dialog } from '@rescue-frontend/ui';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { AdminListPageLayout } from '../../../admin/shared/admin-list-page-layout';
import { StationFormDrawer, type StationFormTarget } from '../station-form';
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
import { ReviewQueueDialog } from './review-queue-dialog';
import { StationDetailSheet } from './station-detail-sheet';
import { StationExportMenu } from './station-export-menu';
import { StationFilterPanel } from './station-filter-panel';
import { StationImportDialog } from './station-import-dialog';
import { StationMapView } from './station-map-view';
import { QuickStatusCell, TeamAssignCell } from './station-row-controls';
import { StationStatsStrip } from './station-stats-strip';
import { StationTable } from './station-table';
import { StationToolbar, type StationView } from './station-toolbar';

const { color } = designTokens;

const PAGE_GUTTER = { xs: 2, md: 3 };

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

  const stations = useAllStations(filters);
  const unfiltered = useAllStations(EMPTY_FILTERS);
  const loadedRows = stations.data?.rows ?? [];
  const rows = useMemo(
    () => applyClientFilters(loadedRows, filters, now),
    [loadedRows, filters, now],
  );
  // The review queue's own query: it also counts stations whose only suggestions are on their
  // resources, which pendingSuggestedFields (station fields only) leaves out.
  const reviewQueue = useAllStations(PENDING_FILTERS, {
    enabled: caps.canReview,
  });
  const pendingStationCount = caps.canReview
    ? (reviewQueue.data?.rows.length ?? 0)
    : 0;

  const hasAnyStation = (unfiltered.data?.rows.length ?? 0) > 0;
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
  // The station on view lives in the URL (?station=<uuid>) so notifications can link to it. The
  // form opens over it, so cancelling an edit lands back on the station being edited.
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

  return (
    <>
      <AdminListPageLayout
        canvasColor={color.bg.neutral.subtle}
        header={
          <Stack spacing={2} sx={{ px: PAGE_GUTTER, pt: PAGE_GUTTER, pb: 2 }}>
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
              onViewChange={(next) =>
                setParam('view', next === 'map' ? 'map' : null)
              }
              onOpenReview={() => setReviewOpen(true)}
              onNew={() => openNew()}
              onImport={() => setImportOpen(true)}
              exportControl={<StationExportMenu />}
            />
          </Stack>
        }
        filterPanel={
          filterOpen ? (
            <StationFilterPanel
              filters={filters}
              onChange={setFilters}
              canViewTeams={caps.canViewTeams}
            />
          ) : undefined
        }
        filterPanelSx={{ px: PAGE_GUTTER, pb: 2 }}
        listContainerSx={{ px: PAGE_GUTTER, pb: PAGE_GUTTER }}
        list={
          view === 'map' ? (
            <StationMapView
              rows={rows}
              hasAnyStation={hasAnyStation}
              canAdd={caps.canAdd}
              now={now}
              selectedUuid={selectedUuid}
              onSelect={setSelectedUuid}
              onOpenStation={openStation}
              onAddAt={
                caps.canAdd ? (position) => openNew(position) : undefined
              }
            />
          ) : (
            <StationTable
              rows={rows}
              hasAnyStation={hasAnyStation}
              loading={stations.isPending}
              truncated={stations.data?.truncated ?? false}
              now={now}
              canAdd={caps.canAdd}
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
          )
        }
      />
      <StationDetailSheet
        uuid={viewedUuid}
        caps={caps}
        now={now}
        onClose={() => openStation(null)}
        onEdit={editStation}
        onDelete={(uuid, name) => setPendingDelete({ uuid, name })}
      />
      <StationFormDrawer
        target={formTarget}
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
