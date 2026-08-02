'use client';

import AddRoundedIcon from '@mui/icons-material/AddRounded';
import FileUploadRoundedIcon from '@mui/icons-material/FileUploadRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import { Box } from '@mui/material';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';

import { TicketCreateDrawer } from '../ticket-create/ticket-create-drawer';
import { TicketReportDrawer } from '../ticket-report/ticket-report-drawer';
import {
  createTicketReportRecord,
  createTicketReportRecordFromRow,
  createTicketRowFromReport,
  type TicketReportFormValues,
  type TicketReportRecord,
} from '../ticket-report/model';
import { TicketListCanvas } from './ticket-list-canvas';
import {
  createTicketListFilterItems,
  filterTicketRowsBySelection,
  isTicketFilterKey,
  parseTicketFilterKeywordSearchParam,
  parseTicketFilterSearchParams,
  removeTicketCategoryFilterSearchParams,
  removeTicketFilterSearchParams,
  setTicketFilterSearchParams,
  ticketFilterGroups,
} from './ticket-filters';
import type { TicketListActionItem, TicketListRowItem } from './types';

const initialTicketRows: readonly TicketListRowItem[] = [
  {
    id: 'inc-4022',
    status: 'critical',
    code: '#INC-4022',
    title: '醫療物資運送',
    taskType: '醫療',
    disasterType: '醫療',
    disasterGlyph: '⚕️',
    region: 'north',
    location: '北橋街 124 號',
    priority: 'high',
    verification: 'unverified',
    aiFlagged: true,
    createdAt: '10月24日 14:42',
  },
  {
    id: 'inc-4021',
    status: 'inProgress',
    code: '#INC-4021',
    title: 'B 區醫療後送',
    taskType: '醫療',
    disasterType: '醫療',
    disasterGlyph: '⚕️',
    region: 'central',
    location: 'B 區，第 3 網格',
    priority: 'high',
    verification: 'aiVerified',
    aiFlagged: true,
    createdAt: '10月24日 14:15',
  },
  {
    id: 'inc-4020',
    status: 'pending',
    code: '#INC-4020',
    title: '9 號公路障礙清除',
    taskType: '道路清理',
    disasterType: '交通',
    disasterGlyph: '🚧',
    region: 'transit',
    location: '9 號公路 42 公里處',
    priority: 'medium',
    verification: 'unverified',
    createdAt: '10月24日 13:50',
  },
  {
    id: 'inc-4018',
    status: 'completed',
    code: '#INC-4018',
    title: 'C 點物資配送',
    taskType: '後勤',
    disasterType: '物資',
    disasterGlyph: '📦',
    region: 'central',
    location: 'C 點倉庫',
    priority: 'low',
    verification: 'humanVerified',
    createdAt: '10月24日 12:30',
  },
  {
    id: 'inc-4017',
    status: 'inProgress',
    code: '#INC-4017',
    title: '北岸防洪牆加固',
    taskType: '工務',
    disasterType: '水患',
    disasterGlyph: '🌊',
    region: 'north',
    location: '河北岸',
    priority: 'high',
    verification: 'disputed',
    aiFlagged: true,
    createdAt: '10月24日 11:20',
  },
  {
    id: 'inc-4016',
    status: 'pending',
    code: '#INC-4016',
    title: '榆樹街瓦礫清運申請',
    taskType: '清理',
    disasterType: '瓦礫',
    disasterGlyph: '🌪️',
    region: 'central',
    location: '榆樹街第 2 街廓',
    priority: 'low',
    verification: 'aiVerified',
    createdAt: '10月24日 10:05',
  },
] as const;

function createHref(pathname: string, searchParams: URLSearchParams) {
  const nextQuery = searchParams.toString();

  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
}

function formatCount(value: number) {
  return value.toLocaleString('zh-TW');
}

function createVisibleRangeLabel(totalRows: number) {
  if (!totalRows) {
    return '0 / 0';
  }

  return `1-${Math.min(totalRows, 10)} / ${totalRows}`;
}

function createInitialReportRecords(rows: readonly TicketListRowItem[]) {
  return rows.reduce<Record<string, TicketReportRecord>>((records, row) => {
    records[row.id] = createTicketReportRecordFromRow(row);
    return records;
  }, {});
}

function getNextTicketSequence(rows: readonly TicketListRowItem[]) {
  const maxSequence = rows.reduce((currentMax, row) => {
    const match = /^#INC-(\d+)$/.exec(row.code);

    if (!match) {
      return currentMax;
    }

    return Math.max(currentMax, Number(match[1]));
  }, 0);

  return maxSequence + 1;
}

function downloadOperationHistory(records: readonly TicketReportRecord[]) {
  const payload = {
    exportedAt: new Date().toISOString(),
    reports: records,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = `ticket-operation-history-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function TicketListPage() {
  const router = useRouter();
  const pathname = usePathname() ?? '/admin/tickets';
  const searchParams = useSearchParams();
  const [rows, setRows] =
    useState<readonly TicketListRowItem[]>(initialTicketRows);
  const [reportRecords, setReportRecords] = useState<
    Record<string, TicketReportRecord>
  >(() => createInitialReportRecords(initialTicketRows));
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'detail'>('create');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const activeFilters = parseTicketFilterSearchParams(searchParams);
  const keyword = parseTicketFilterKeywordSearchParam(searchParams);
  const filteredRows = filterTicketRowsBySelection(
    rows,
    activeFilters,
    keyword,
  );

  const selectedReport = selectedReportId
    ? reportRecords[selectedReportId]
    : null;

  const openCreateDrawer = useCallback(() => {
    setCreateDrawerOpen(true);
  }, []);

  const openReportDetail = useCallback((reportId: string) => {
    setDrawerMode('detail');
    setSelectedReportId(reportId);
    setDrawerOpen(true);
  }, []);

  const closeReportDrawer = useCallback(() => {
    setDrawerOpen(false);
  }, []);

  const closeCreateDrawer = useCallback(() => {
    setCreateDrawerOpen(false);
  }, []);

  const createReport = useCallback(
    (values: TicketReportFormValues) => {
      const report = createTicketReportRecord(
        values,
        getNextTicketSequence(rows),
      );
      const row = createTicketRowFromReport(report);

      setRows((currentRows) => [row, ...currentRows]);
      setReportRecords((currentRecords) => ({
        ...currentRecords,
        [report.id]: report,
      }));
      setSelectedReportId(report.id);
      setDrawerMode('detail');
      setDrawerOpen(true);
    },
    [rows],
  );

  const rowsWithActions = useMemo(
    () =>
      filteredRows.map((row) => ({
        ...row,
        onOverflowClick: () => openReportDetail(row.id),
      })),
    [filteredRows, openReportDetail],
  );

  const headerActions = useMemo<readonly TicketListActionItem[]>(
    () => [
      {
        id: 'export',
        label: '匯出',
        icon: <FileUploadRoundedIcon />,
        variant: 'outlined',
        onClick: () => downloadOperationHistory(Object.values(reportRecords)),
      },
      {
        id: 'field-config',
        label: '欄位設定',
        icon: <TuneRoundedIcon />,
        variant: 'outlined',
      },
      {
        id: 'new-ticket',
        label: '新增任務',
        icon: <AddRoundedIcon />,
        variant: 'filled',
        onClick: openCreateDrawer,
      },
    ],
    [openCreateDrawer, reportRecords],
  );

  const clearFilters = () => {
    const nextSearchParams = new URLSearchParams(searchParams.toString());

    removeTicketFilterSearchParams(nextSearchParams);
    router.replace(createHref(pathname, nextSearchParams), { scroll: false });
  };

  const updateFilter = (filterId: string, value?: string) => {
    if (!isTicketFilterKey(filterId)) {
      return;
    }

    const nextSearchParams = new URLSearchParams(searchParams.toString());
    const nextFilters = { ...activeFilters, [filterId]: value };

    if (!value) {
      delete nextFilters[filterId];
    }

    removeTicketCategoryFilterSearchParams(nextSearchParams);
    setTicketFilterSearchParams(nextSearchParams, nextFilters);
    router.replace(createHref(pathname, nextSearchParams), { scroll: false });
  };

  return (
    <Box sx={{ width: '100%', height: '100%', minHeight: 0 }}>
      <TicketListCanvas
        headerTitle="任務管理"
        headerActions={headerActions}
        filters={createTicketListFilterItems(activeFilters)}
        filterPanels={ticketFilterGroups.map((group) => ({
          id: group.key,
          label: group.label,
          options: group.options,
        }))}
        selectedFilterValues={activeFilters}
        onFilterChange={updateFilter}
        onClearFilters={clearFilters}
        rows={rowsWithActions}
        totalCountLabel={`總數: ${formatCount(filteredRows.length)}`}
        pagination={{
          rowsPerPageLabel: '每頁筆數：',
          rowsPerPageValue: '10',
          visibleRangeLabel: createVisibleRangeLabel(filteredRows.length),
          page: 1,
          pageCount: Math.max(1, Math.ceil(filteredRows.length / 10)),
          previousAriaLabel: '上一頁任務',
          nextAriaLabel: '下一頁任務',
        }}
      />
      <TicketReportDrawer
        open={drawerOpen}
        mode={drawerMode}
        report={selectedReport}
        onClose={closeReportDrawer}
        onCreate={createReport}
      />
      <TicketCreateDrawer
        open={createDrawerOpen}
        onClose={closeCreateDrawer}
        onCreated={(row) => {
          setRows((currentRows) => [row, ...currentRows]);
          setCreateDrawerOpen(false);
        }}
      />
    </Box>
  );
}
