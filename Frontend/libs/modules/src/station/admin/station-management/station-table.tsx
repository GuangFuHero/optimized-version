'use client';

import { Box, Typography } from '@mui/material';
import {
  Button,
  Callout,
  DataTable,
  designTokens,
  Tag,
  type BadgeTone,
  type DataTableProps,
} from '@rescue-frontend/ui';
import {
  ChevronRight,
  MapPin,
  MapPinPlus,
  Plus,
  SearchX,
  ShieldCheck,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { Muted } from '../../../admin/shared/muted';
import { getStationTypeIcon, type StationTypeValue } from '../../type-options';
import { FreshnessCell } from '../../../admin/shared/freshness-cell';
import { StatusBadge, TypeChip } from './station-cells';
import type { StationRow } from './model/station-row';

const { color, radius, typography } = designTokens;

/**
 * Tints the name cell's type tile. The prototype gives each of its six types a tone
 * (station-data.jsx TYPE); our eleven map onto the same tones by kinship — water-like types take
 * info, energy types warning, the rest neutral.
 */
const TYPE_TONE: Record<StationTypeValue, BadgeTone> = {
  water: 'info',
  shower: 'info',
  shelter: 'secondary',
  supply: 'primary',
  medical: 'danger',
  gas_station: 'warning',
  charge: 'warning',
  power: 'warning',
  toilet: 'neutral',
  transport: 'neutral',
  cellular: 'neutral',
};

function typeTileColors(type: string): { bg: string; fg: string } {
  const tone = TYPE_TONE[type as StationTypeValue] ?? 'neutral';
  return tone === 'neutral'
    ? { bg: color.bg.neutral.sunken, fg: color.bg.info.default }
    : { bg: color.bg[tone].subtle, fg: color.bg[tone].default };
}

interface StationTableProps {
  rows: StationRow[];
  /** Whether the scope has any stations before filtering, to pick the empty state. */
  hasAnyStation: boolean;
  loading: boolean;
  truncated: boolean;
  now: Date;
  /** Set when the viewer may create stations: the no-stations state offers it. */
  onNew?: () => void;
  /** Set when the viewer may import: the no-stations state offers it. */
  onImport?: () => void;
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
  onNew,
  onImport,
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
      meta: { width: '120px' },
      cell: ({ row }) => <TypeChip type={row.original.type} />,
    },
    {
      id: 'area',
      header: '行政區',
      meta: { width: '110px' },
      cell: ({ row }) => <AreaCell area={row.original.area} />,
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
      meta: { width: '138px' },
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
      meta: { width: '130px' },
      cell: ({ row }) => (
        <FreshnessCell updatedAt={row.original.updatedAt} now={now} />
      ),
    },
    {
      id: 'open',
      header: '',
      meta: { width: '28px' },
      cell: () => (
        <ChevronRight
          size={18}
          color={color.fg.neutral.muted}
          style={{ display: 'block' }}
        />
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
              <Muted cell>載入中…</Muted>
            </Box>
          ) : (
            <StationEmptyState
              hasAnyStation={hasAnyStation}
              onNew={onNew}
              onImport={onImport}
            />
          )
        }
      />
    </Box>
  );
}

/**
 * "No stations yet" offers whichever of import and create the viewer may do; "nothing matches"
 * only asks them to loosen the filters.
 */
export function StationEmptyState({
  hasAnyStation,
  onNew,
  onImport,
}: {
  hasAnyStation: boolean;
  onNew?: () => void;
  onImport?: () => void;
}) {
  if (hasAnyStation) {
    return (
      <StationEmptyLook
        icon={SearchX}
        title="沒有符合條件的站點"
        caption="調整篩選或搜尋關鍵字再試。"
      />
    );
  }
  return (
    <StationEmptyLook
      icon={MapPinPlus}
      title="還沒有任何資源站點"
      caption="新增站點或從 CSV 匯入後，會出現在這裡。"
      actions={
        onNew || onImport ? (
          <>
            {onImport ? (
              <Button
                size="sm"
                variant="outline"
                startIcon={<Upload size={15} />}
                onClick={onImport}
              >
                匯入 CSV
              </Button>
            ) : null}
            {onNew ? (
              <Button size="sm" startIcon={<Plus size={15} />} onClick={onNew}>
                新增站點
              </Button>
            ) : null}
          </>
        ) : undefined
      }
    />
  );
}

/** The prototype's list empty state: a bare icon, not the shared EmptyState's circle. */
function StationEmptyLook({
  icon: Icon,
  title,
  caption,
  actions,
}: {
  icon: LucideIcon;
  title: string;
  caption: string;
  actions?: ReactNode;
}) {
  return (
    <Box
      sx={{
        p: '64px 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        color: color.fg.neutral.muted,
      }}
    >
      <Icon size={38} color={color.fg.neutral.muted} />
      <Typography
        sx={{
          ...typography.heading[600],
          mt: '12px',
          color: color.fg.neutral.subtle,
        }}
      >
        {title}
      </Typography>
      <Typography
        sx={{
          ...typography.body[300],
          mt: '4px',
          maxWidth: 420,
          lineHeight: 1.7,
          color: color.fg.neutral.muted,
        }}
      >
        {caption}
      </Typography>
      {actions ? (
        <Box sx={{ display: 'flex', gap: '8px', mt: '16px' }}>{actions}</Box>
      ) : null}
    </Box>
  );
}

function StationNameCell({ row }: { row: StationRow }) {
  const TypeIcon = getStationTypeIcon(row.type);
  const tile = typeTileColors(row.type);
  return (
    <Box
      sx={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}
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
          bgcolor: tile.bg,
          color: tile.fg,
        }}
      >
        <TypeIcon sx={{ fontSize: 18 }} />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography
          noWrap
          title={row.name}
          sx={{ ...typography.label[400], color: color.fg.neutral.default }}
        >
          {row.name}
        </Typography>
        {/* No display id to show yet, so the second line only carries the tags, when there are any. */}
        {row.isOfficial || row.pendingFieldCount > 0 ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '8px',
              mt: '3px',
            }}
          >
            {row.isOfficial ? (
              <Tag tone="info" icon={<ShieldCheck size={13} />}>
                官方
              </Tag>
            ) : null}
            {row.pendingFieldCount > 0 ? (
              <Tag tone="warning" size="sm">
                {row.pendingFieldCount} 欄待審
              </Tag>
            ) : null}
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}

/** The prototype's `AssignTeamCell` text: a team in subtle grey, 未指派 in muted. */
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

function AreaCell({ area }: { area: string }) {
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        minWidth: 0,
      }}
    >
      <MapPin
        size={14}
        color={color.fg.neutral.muted}
        style={{ flexShrink: 0 }}
      />
      <Typography
        noWrap
        sx={{ ...typography.body[300], color: color.fg.neutral.muted }}
      >
        {area || '—'}
      </Typography>
    </Box>
  );
}
