'use client';

import type { ReactNode } from 'react';

import AddRoundedIcon from '@mui/icons-material/AddRounded';
import FileUploadRoundedIcon from '@mui/icons-material/FileUploadRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { ListPagination } from '@rescue-frontend/ui';

import { AdminListPageLayout } from '../../../admin/shared/admin-list-page-layout';
import { StationCreateDrawer } from '../station-create/station-create-drawer';
import { useStationListColorScheme } from './constants';
import {
  filterStationRowsBySelection,
  isStationFilterKey,
  parseStationFilterSearchParams,
  removeStationFilterSearchParams,
  setStationFilterSearchParams,
  stationFilterGroups,
} from './station-filters';
import { StationListIconSlot } from './station-list-primitives';
import { StationListTable } from './station-list-table';
import type { StationListRow } from './types';

const stationRows: readonly StationListRow[] = [
  {
    id: 'st-alpha',
    code: 'ST-ALPHA',
    name: '北橋收容站',
    type: '收容與補給',
    address: '北橋街 124 號',
    status: 'active',
    currentOccupancy: 340,
    capacity: 500,
    suppliesLabel: '醫療包 42',
    commander: 'Sarah Jenkins',
    updatedAt: '14:42',
  },
  {
    id: 'st-bravo',
    code: 'ST-BRAVO',
    name: '南岸醫療站',
    type: '醫療',
    address: '南岸公園東側',
    status: 'limited',
    currentOccupancy: 118,
    capacity: 140,
    suppliesLabel: '水 88 加侖',
    commander: 'Daniel Wu',
    updatedAt: '14:12',
  },
  {
    id: 'depot-c',
    code: 'DEPOT-C',
    name: 'C 點物資倉',
    type: '倉儲',
    address: '工業區 3 號倉',
    status: 'active',
    currentOccupancy: 26,
    capacity: 80,
    suppliesLabel: '口糧 800',
    commander: 'Lina Chen',
    updatedAt: '13:55',
  },
  {
    id: 'chk-04',
    code: 'CHK-04',
    name: '第四區檢查點',
    type: '管制點',
    address: '山路 7K 交會口',
    status: 'offline',
    currentOccupancy: 0,
    capacity: 48,
    suppliesLabel: '通訊待修',
    commander: 'Miguel Santos',
    updatedAt: '12:40',
  },
] as const;

function formatCount(value: number) {
  return value.toLocaleString('zh-TW');
}

function createVisibleRangeLabel(totalRows: number) {
  if (!totalRows) {
    return '0 / 0';
  }

  return `1-${Math.min(totalRows, 10)} / ${totalRows}`;
}

function createHref(pathname: string, searchParams: URLSearchParams) {
  const nextQuery = searchParams.toString();

  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
}

function HeaderButton({
  icon,
  label,
  filled,
}: {
  icon: ReactNode;
  label: string;
  filled?: boolean;
}) {
  const stationListPalette = useStationListColorScheme();

  return (
    <ButtonBase
      disableRipple
      aria-label={label}
      sx={{
        height: 34,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        px: filled ? 2 : '17px',
        borderRadius: '999px',
        border: filled
          ? '1px solid transparent'
          : `1px solid ${stationListPalette.border}`,
        bgcolor: filled ? stationListPalette.action : stationListPalette.canvas,
        color: filled
          ? stationListPalette.actionText
          : stationListPalette.heading,
        '&:hover': {
          bgcolor: filled
            ? stationListPalette.action
            : stationListPalette.actionHover,
        },
      }}
    >
      <StationListIconSlot icon={icon} size={14} color="currentColor" />
      <Typography
        sx={{
          color: 'inherit',
          fontSize: 12,
          lineHeight: '16px',
          fontWeight: 700,
          letterSpacing: '0.6px',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </Typography>
    </ButtonBase>
  );
}

function FilterBar({
  selectedStatus,
  onStatusChange,
}: {
  selectedStatus?: string;
  onStatusChange: (value?: string) => void;
}) {
  const stationListPalette = useStationListColorScheme();
  const statusGroup = stationFilterGroups[0];

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 1.5,
        px: { mobile: 2, tablet: 3, desktop: 4 },
        py: 1.25,
        borderTop: `1px solid ${stationListPalette.border}`,
        borderBottom: `1px solid ${stationListPalette.border}`,
        bgcolor: stationListPalette.canvas,
      }}
    >
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
        <ButtonBase
          disableRipple
          aria-label="全部站點"
          aria-pressed={!selectedStatus}
          onClick={() => onStatusChange()}
          sx={{
            height: 30,
            px: '17px',
            borderRadius: '999px',
            border: `1px solid ${!selectedStatus ? stationListPalette.limitedText : stationListPalette.border}`,
            bgcolor: !selectedStatus
              ? stationListPalette.surface
              : stationListPalette.canvas,
            color: stationListPalette.heading,
          }}
        >
          <Typography sx={{ fontSize: 14, lineHeight: '20px' }}>
            全部站點
          </Typography>
        </ButtonBase>

        {statusGroup.options.map((option) => {
          const selected = selectedStatus === option.value;

          return (
            <ButtonBase
              key={option.value}
              disableRipple
              aria-label={option.label}
              aria-pressed={selected}
              onClick={() => onStatusChange(option.value)}
              sx={{
                height: 30,
                px: '17px',
                borderRadius: '999px',
                border: `1px solid ${selected ? stationListPalette.limitedText : stationListPalette.border}`,
                bgcolor: selected
                  ? stationListPalette.surface
                  : stationListPalette.canvas,
                color: stationListPalette.heading,
              }}
            >
              <Typography sx={{ fontSize: 14, lineHeight: '20px' }}>
                {option.label}
              </Typography>
            </ButtonBase>
          );
        })}
      </Stack>
    </Box>
  );
}

function StationListHeader({ onCreate }: { onCreate: () => void }) {
  const stationListPalette = useStationListColorScheme();

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 2,
        px: { mobile: 2, tablet: 3, desktop: 4 },
        pt: 2,
        pb: 2,
        bgcolor: stationListPalette.surface,
        borderBottom: `1px solid ${stationListPalette.border}`,
      }}
    >
      <Stack
        spacing={1.5}
        sx={{ minWidth: 0, display: { mobile: 'none', tablet: 'flex' } }}
      >
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
          <Typography
            sx={{
              color: stationListPalette.heading,
              fontSize: { mobile: 24, tablet: 28, desktop: 32 },
              lineHeight: { mobile: '32px', tablet: '36px', desktop: '40px' },
              fontWeight: 800,
            }}
          >
            資源站點
          </Typography>
        </Stack>
      </Stack>

      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
        <HeaderButton icon={<FileUploadRoundedIcon />} label="匯出" />
        <HeaderButton icon={<TuneRoundedIcon />} label="欄位設定" />
        <Box onClick={onCreate}>
          <HeaderButton icon={<AddRoundedIcon />} label="新增站點" filled />
        </Box>
      </Stack>
    </Box>
  );
}

export function StationListPage() {
  const router = useRouter();
  const pathname = usePathname() ?? '/admin/stations';
  const searchParams = useSearchParams();
  const stationListPalette = useStationListColorScheme();
  const [rows, setRows] = useState<readonly StationListRow[]>(stationRows);
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const pageSize = 10;
  const activeFilters = parseStationFilterSearchParams(searchParams);
  const filteredRows = filterStationRowsBySelection(rows, activeFilters);

  const updateFilter = (filterId: string, value?: string) => {
    if (!isStationFilterKey(filterId)) {
      return;
    }

    const nextSearchParams = new URLSearchParams(searchParams.toString());
    const nextFilters = { ...activeFilters, [filterId]: value };

    if (!value) {
      delete nextFilters[filterId];
    }

    removeStationFilterSearchParams(nextSearchParams);
    setStationFilterSearchParams(nextSearchParams, nextFilters);
    router.replace(createHref(pathname, nextSearchParams), { scroll: false });
  };

  return (
    <>
      <AdminListPageLayout
        canvasColor={stationListPalette.canvas}
        header={<StationListHeader onCreate={() => setCreateDrawerOpen(true)} />}
        filterPanel={
          <FilterBar
            selectedStatus={activeFilters.status}
            onStatusChange={(value) => updateFilter('status', value)}
          />
        }
        filterPanelSx={{ display: { mobile: 'none', tablet: 'block' } }}
        list={<StationListTable rows={filteredRows} />}
        listContainerSx={{
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        footer={
          <Stack
            direction="row"
            sx={{
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 2,
              px: 3,
              py: '10px',
              borderTop: `1px solid ${stationListPalette.border}`,
              bgcolor: stationListPalette.canvas,
            }}
          >
            <Typography
              sx={{
                color: stationListPalette.bodyText,
                fontSize: 12,
                lineHeight: '16px',
                fontWeight: 400,
                whiteSpace: 'nowrap',
              }}
            >
              總數: {formatCount(filteredRows.length)}
            </Typography>

            <Stack
              direction="row"
              spacing={2}
              sx={{ alignItems: 'center', flexShrink: 0 }}
            >
              <Typography
                sx={{
                  color: stationListPalette.bodyText,
                  fontSize: 12,
                  lineHeight: '16px',
                  fontWeight: 400,
                  whiteSpace: 'nowrap',
                }}
              >
                每頁筆數： {formatCount(pageSize)}
              </Typography>
              <Typography
                sx={{
                  color: stationListPalette.bodyText,
                  fontSize: 12,
                  lineHeight: '16px',
                  fontWeight: 400,
                  whiteSpace: 'nowrap',
                }}
              >
                {createVisibleRangeLabel(filteredRows.length)}
              </Typography>
              <ListPagination
                page={1}
                pageCount={Math.max(1, Math.ceil(filteredRows.length / pageSize))}
                previousAriaLabel="上一頁站點"
                nextAriaLabel="下一頁站點"
                sx={{
                  '& .MuiPaginationItem-root': {
                    color: stationListPalette.bodyText,
                  },
                }}
              />
            </Stack>
          </Stack>
        }
      />
      <StationCreateDrawer
        open={createDrawerOpen}
        onClose={() => setCreateDrawerOpen(false)}
        onCreated={(row) => {
          setRows((current) => [row, ...current]);
          setCreateDrawerOpen(false);
        }}
      />
    </>
  );
}
