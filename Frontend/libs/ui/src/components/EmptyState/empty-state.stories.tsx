import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import SearchOffRoundedIcon from '@mui/icons-material/SearchOffRounded';
import { Button } from '@mui/material';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { EmptyState } from './index';

const meta = {
  title: 'Components/EmptyState',
  component: EmptyState,
  args: {
    icon: <SearchOffRoundedIcon />,
    title: '沒有符合條件的任務',
    description: '試著放寬篩選條件，或清除搜尋關鍵字。',
  },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const TitleOnly: Story = {
  args: {
    icon: <InboxOutlinedIcon />,
    title: '此範圍內沒有紀錄',
    description: undefined,
  },
};
export const WithAction: Story = {
  args: { action: <Button variant="outlined">清除篩選</Button> },
};
