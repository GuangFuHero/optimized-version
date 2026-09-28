import SearchOffRoundedIcon from '@mui/icons-material/SearchOffRounded';
import { Box, Typography } from '@mui/material';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { createColumnHelper } from '@tanstack/react-table';
import { fn } from 'storybook/test';

import { designTokens } from '../../theme';
import { Badge, type BadgeTone } from '../Badge';
import { EmptyState } from '../EmptyState';
import { DataTable, type DataTableFeatures } from './index';

const { color, typography } = designTokens;

interface Ticket {
  id: string;
  title: string;
  address: string;
  priority: '生命危急' | '緊急' | '一般';
  status: string;
  team?: string;
  updated: string;
  deleted?: boolean;
}

const PRIORITY_TONE: Record<Ticket['priority'], BadgeTone> = {
  生命危急: 'danger',
  緊急: 'warning',
  一般: 'neutral',
};

const ROWS: Ticket[] = [
  {
    id: 'TK-1042',
    title: '民宅一樓淤泥清除，需要鏟子與推車',
    address: '光復鄉大華村中正路一段 12 號',
    priority: '生命危急',
    status: '待指派',
    updated: '3 分鐘前',
  },
  {
    id: 'TK-1039',
    title: '獨居長者需協助搬運家具至二樓',
    address: '光復鄉大馬村林森路 88 巷 4 號',
    priority: '緊急',
    status: '進行中',
    team: '慈濟基金會',
    updated: '25 分鐘前',
  },
  {
    id: 'TK-1031',
    title: '飲用水 20 箱',
    address: '光復鄉東富村復興路 2 號',
    priority: '一般',
    status: '已完成',
    team: '紅十字會花蓮分會',
    updated: '2 小時前',
  },
  {
    id: 'TK-1027',
    title: '重複回報：大華村淤泥',
    address: '光復鄉大華村中正路一段 12 號',
    priority: '一般',
    status: '已取消',
    updated: '昨天',
    deleted: true,
  },
];

const muted = { ...typography.data[300], color: color.fg.neutral.muted };

const columnHelper = createColumnHelper<DataTableFeatures, Ticket>();

const COLUMNS = columnHelper.columns([
  columnHelper.accessor('priority', {
    header: '優先級',
    meta: { width: '104px' },
    cell: ({ getValue }) => (
      <Badge
        tone={PRIORITY_TONE[getValue()]}
        variant={getValue() === '生命危急' ? 'solid' : 'subtle'}
      >
        {getValue()}
      </Badge>
    ),
  }),
  columnHelper.display({
    id: 'ticket',
    header: '任務',
    meta: { width: 'minmax(0, 2.4fr)' },
    cell: ({ row }) => (
      <>
        <Typography sx={muted}>#{row.original.id}</Typography>
        <Typography
          noWrap
          title={row.original.title}
          sx={{ ...typography.label[400], mt: '2px' }}
        >
          {row.original.title}
        </Typography>
        <Typography
          noWrap
          sx={{ ...typography.body[300], color: color.fg.neutral.muted }}
        >
          {row.original.address}
        </Typography>
      </>
    ),
  }),
  columnHelper.accessor('updated', {
    header: '更新時間',
    meta: { width: '92px' },
    cell: ({ getValue }) => <Typography sx={muted}>{getValue()}</Typography>,
  }),
  columnHelper.accessor('status', {
    header: '狀態',
    meta: { width: '92px' },
    cell: ({ getValue }) => (
      <Typography sx={typography.data[300]}>{getValue()}</Typography>
    ),
  }),
  columnHelper.accessor('team', {
    header: '指派 Team',
    meta: { width: 'minmax(0, 1fr)' },
    cell: ({ getValue }) => (
      <Typography
        noWrap
        sx={{
          ...typography.body[300],
          color: getValue() ? color.fg.neutral.subtle : color.fg.neutral.muted,
        }}
      >
        {getValue() ?? '未指派'}
      </Typography>
    ),
  }),
]);

const EMPTY_ROWS: Ticket[] = [];

const meta = {
  title: 'Components/DataTable',
  component: DataTable,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <Box sx={{ maxWidth: 960 }}>
        <Story />
      </Box>
    ),
  ],
} satisfies Meta<typeof DataTable>;

export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <DataTable
      columns={COLUMNS}
      data={ROWS}
      getRowId={(row) => row.id}
      onRowClick={fn()}
      getRowSx={(row) => (row.deleted ? { opacity: 0.62 } : {})}
    />
  ),
};

export const Compact: Story = {
  render: () => (
    <DataTable
      columns={COLUMNS}
      data={ROWS}
      getRowId={(row) => row.id}
      density="compact"
    />
  ),
};

export const HorizontalScroll: Story = {
  render: () => (
    <Box sx={{ width: 560 }}>
      <DataTable
        columns={COLUMNS}
        data={ROWS}
        getRowId={(row) => row.id}
        minWidth={900}
      />
    </Box>
  ),
};

export const Empty: Story = {
  render: () => (
    <DataTable
      columns={COLUMNS}
      data={EMPTY_ROWS}
      getRowId={(row) => row.id}
      empty={
        <EmptyState
          icon={<SearchOffRoundedIcon />}
          title="沒有符合條件的任務"
          description="試著放寬篩選條件。"
        />
      }
    />
  ),
};
