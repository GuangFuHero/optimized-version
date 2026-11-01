import { Stack } from '@mui/material';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { Progress } from './index';

const meta = {
  title: 'Components/Progress',
  component: Progress,
  args: { value: 3, max: 8, label: '清淤人力' },
} satisfies Meta<typeof Progress>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Cases: Story = {
  render: () => (
    <Stack sx={{ gap: 2, maxWidth: 320 }}>
      <Progress value={3} max={8} label="清淤人力" />
      <Progress value={4} max={4} label="搬運" />
      {/* More than asked for is still full (PRG-105). */}
      <Progress value={10} max={8} label="物資整理" />
      {/* Ended short (PRG-105). */}
      <Progress value={3} max={8} label="送餐" ended />
      {/* Every place taken, the work not done: not green (PRG-102). */}
      <Progress
        value={3}
        max={3}
        label="在途"
        complete={false}
        tone="neutral"
        size="sm"
      />
      {/* No total: no bar (PRG-104). */}
      <Progress value={2} label="受困人員救援" />
    </Stack>
  ),
};
