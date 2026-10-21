'use client';

import { Box, Typography } from '@mui/material';
import {
  Badge,
  Callout,
  DataTable,
  designTokens,
  EmptyState,
  type DataTableProps,
} from '@rescue-frontend/ui';
import { MapPinned, SearchX, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';

import { getStationTypeIcon } from '../../type-options';
import { FreshnessCell, StatusBadge } from './station-cells';
import type { StationRow } from './model/station-row';

const { color, radius, typography } = designTokens;

interface StationTableProps {
  rows: StationRow[];
  /** Whether the scope has any stations before filtering, to pick the empty state. */
  hasAnyStation: boolean;
  loading: boolean;
  truncated: boolean;
  now: Date;
  canAdd: boolean;
  onOpenStation: (uuid: string) => void;
  renderStatus?: (row: StationRow) => ReactNode;
  renderTeam?: (row: StationRow) => ReactNode;
}

export function StationTable({
  rows,
  hasAnyStation,
  loading,
  truncated,
  now,
  canAdd,
  onOpenStation,
  renderStatus,
  renderTeam,
}: StationTableProps) {
  const columns: DataTableProps<StationRow>['columns'] = [
    {
      id: 'station',
      header: '站點',
      meta: { width: 'minmax(240px, 2.2fr)' },
      cell: ({ row }) => <StationNameCell row={row.original} />,
    },
    {
      id: 'type',
      header: '類型',
      meta: { width: '96px' },
      cell: ({ row }) => <Muted>{row.original.typeLabel}</Muted>,
    },
    {
      id: 'area',
      header: '行政區',
      meta: { width: '130px' },
      cell: ({ row }) => <Muted>{row.original.area || '—'}</Muted>,
    },
    {
      id: 'status',
      header: '營運狀態',
      meta: { width: '150px' },
      cell: ({ row }) =>
        renderStatus ? (
          renderStatus(row.original)
        ) : (
          <StatusBadge status={row.original.operationalStatus} />
        ),
    },
    {
      id: 'team',
      header: '指派 Team',
      meta: { width: '150px' },
      cell: ({ row }) =>
        renderTeam ? (
          renderTeam(row.original)
        ) : (
          <TeamText name={row.original.teamName} />
        ),
    },
    {
      id: 'updated',
      header: '最後更新',
      meta: { width: '120px' },
      cell: ({ row }) => (
        <FreshnessCell updatedAt={row.original.updatedAt} now={now} />
      ),
    },
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {truncated ? (
        <Callout tone="warning">
          只載入前 5,000 個站點，請用篩選縮小範圍。
        </Callout>
      ) : null}
      <Box
        sx={{
          border: `1px solid ${color.border.default}`,
          borderRadius: `${radius.lg}px`,
          overflow: 'auto',
          bgcolor: color.bg.neutral.default,
        }}
      >
        <DataTable
          columns={columns}
          data={rows}
          getRowId={(row) => row.uuid}
          onRowClick={(row) => onOpenStation(row.uuid)}
          density="compact"
          minWidth={1000}
          empty={
            loading ? (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <Muted>載入中…</Muted>
              </Box>
            ) : (
              <StationEmptyState
                hasAnyStation={hasAnyStation}
                canAdd={canAdd}
              />
            )
          }
        />
      </Box>
    </Box>
  );
}

export function StationEmptyState({
  hasAnyStation,
  canAdd,
}: {
  hasAnyStation: boolean;
  canAdd: boolean;
}) {
  if (hasAnyStation) {
    return (
      <EmptyState
        icon={<SearchX size={28} />}
        title="此條件下沒有站點"
        description="調整篩選或搜尋再試。"
      />
    );
  }
  return (
    <EmptyState
      icon={<MapPinned size={28} />}
      title="還沒有資源站點"
      description={
        canAdd
          ? '資源站點是可以去取得幫助的地方：加水站、物資站、避難收容所、醫療站、流動廁所等。在這裡用「新增站點」一筆筆建立，或從 CSV 匯入。建立後民眾在前台地圖看得到；現場的人可以回報修改建議，在「審查」處理。'
          : '資源站點是可以去取得幫助的地方：加水站、物資站、避難收容所、醫療站、流動廁所等。目前你的權限範圍內還沒有站點。'
      }
    />
  );
}

function StationNameCell({ row }: { row: StationRow }) {
  const TypeIcon = getStationTypeIcon(row.type);
  return (
    <Box
      sx={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}
    >
      <Box
        sx={{
          width: 36,
          height: 36,
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: `${radius.md}px`,
          bgcolor: color.bg.primary.subtle,
          color: color.brand.primary.subtle,
        }}
      >
        <TypeIcon fontSize="small" />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography noWrap title={row.name} sx={typography.label[400]}>
          {row.name}
        </Typography>
        <Box
          sx={{ display: 'flex', alignItems: 'center', gap: '6px', mt: '2px' }}
        >
          <Typography
            sx={{ ...typography.data[300], color: color.fg.neutral.muted }}
          >
            {row.uuid.slice(0, 8)}
          </Typography>
          {row.isOfficial ? (
            <Badge tone="info" size="sm" icon={<ShieldCheck size={12} />}>
              官方
            </Badge>
          ) : null}
          {row.pendingFieldCount > 0 ? (
            <Badge tone="warning" size="sm">
              {row.pendingFieldCount} 欄待審
            </Badge>
          ) : null}
        </Box>
      </Box>
    </Box>
  );
}

export function TeamText({ name }: { name: string | null }) {
  return (
    <Typography
      noWrap
      sx={{
        ...typography.body[300],
        color: name ? color.fg.neutral.subtle : color.fg.neutral.muted,
      }}
    >
      {name ?? '未指派'}
    </Typography>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return (
    <Typography
      noWrap
      sx={{ ...typography.body[300], color: color.fg.neutral.subtle }}
    >
      {children}
    </Typography>
  );
}
