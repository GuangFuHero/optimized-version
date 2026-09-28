import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import DoNotDisturbOnOutlinedIcon from '@mui/icons-material/DoNotDisturbOnOutlined';
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded';
import { Box } from '@mui/material';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { Badge } from '../Badge';
import { Timeline, TimelineChange } from './index';

const meta = {
  title: 'Components/Timeline',
  component: Timeline,
  decorators: [
    (Story) => (
      <Box sx={{ width: 520 }}>
        <Story />
      </Box>
    ),
  ],
  args: {
    items: [
      {
        id: '3',
        title: '變更狀態',
        time: '09/28 14:02',
        actor: '林承翰',
        content: <TimelineChange field="狀態" from="待指派" to="進行中" />,
      },
      {
        id: '2',
        title: '指派 Team',
        time: '09/28 13:40',
        actor: '陳怡君',
        tone: 'primary',
        badges: <Badge size="sm">承接</Badge>,
        content: (
          <TimelineChange field="指派 Team" from="未指派" to="慈濟基金會" />
        ),
      },
      { id: '1', title: '建立任務單', time: '09/28 13:12', actor: '民眾回報' },
    ],
  },
} satisfies Meta<typeof Timeline>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Dots: Story = {};

export const Icons: Story = {
  args: {
    items: [
      {
        id: '3',
        title: '發布',
        time: '09/28 18:00',
        actor: '林承翰',
        tone: 'danger',
        icon: <CampaignOutlinedIcon />,
        badges: <Badge tone="success">仍在顯示</Badge>,
        content: '今日 18:00 前需回報各隊在場人數，未回報者由縣府直接致電',
      },
      {
        id: '2',
        title: '取代',
        time: '09/28 12:10',
        actor: '林承翰',
        icon: <SwapHorizRoundedIcon />,
      },
      {
        id: '1',
        title: '關閉',
        time: '09/27 21:30',
        actor: '陳怡君',
        icon: <DoNotDisturbOnOutlinedIcon />,
      },
    ],
  },
};

export const Empty: Story = { args: { items: [] } };
