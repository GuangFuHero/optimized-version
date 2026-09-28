import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import { Box } from '@mui/material';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { Badge } from '../Badge';
import { MetadataTable } from './index';

const meta = {
  title: 'Components/MetadataTable',
  component: MetadataTable,
  args: {
    layout: 'grid',
    divided: false,
    rows: [
      { label: '需求類型', value: '清淤、物資搬運' },
      {
        label: '地址',
        value: '花蓮縣光復鄉大華村中正路一段 12 號',
        note: '近光復國中後門',
      },
      { label: '聯絡人', value: '王小明 · 0912-345-678' },
      { label: '指派 Team', value: null },
      { label: '狀態', value: <Badge tone="warning">待指派</Badge> },
    ],
  },
  argTypes: {
    layout: { control: 'inline-radio', options: ['grid', 'split', 'stacked'] },
  },
  decorators: [
    (Story) => (
      <Box sx={{ width: 440 }}>
        <Story />
      </Box>
    ),
  ],
} satisfies Meta<typeof MetadataTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Grid: Story = {};
export const Split: Story = {
  args: {
    layout: 'split',
    divided: true,
    rows: [
      { label: '站點類型', value: '物資站' },
      { label: '營運狀態', value: <Badge tone="success">營運中</Badge> },
      { label: '容量', value: '120 人' },
      { label: '指派 Team', value: '慈濟基金會' },
      {
        label: '最後盤點',
        value: (
          <Badge variant="dashed" size="sm" icon={<HelpOutlineRoundedIcon />}>
            等後端開欄位
          </Badge>
        ),
      },
    ],
  },
};
export const Stacked: Story = {
  args: {
    layout: 'stacked',
    divided: true,
    emptyText: '無',
    rows: [
      { label: '姓名', value: '林承翰' },
      { label: '電話', value: '0912-345-678', note: '變更需重新驗證' },
      { label: 'Email', value: '' },
    ],
  },
};
