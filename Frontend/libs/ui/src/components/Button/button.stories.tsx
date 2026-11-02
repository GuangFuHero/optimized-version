import { ClipboardCheck, Filter, Plus, Trash2 } from 'lucide-react';

import { Stack } from '@mui/material';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from './index';

const meta = {
  title: 'Components/Button',
  component: Button,
  args: { children: '儲存' },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};

export const Variants: Story = {
  render: (args) => (
    <Stack direction="row" sx={{ gap: 2, alignItems: 'center' }}>
      <Button {...args} variant="primary" />
      <Button {...args} variant="secondary" />
      <Button {...args} variant="danger" />
      <Button {...args} variant="outline" />
      <Button {...args} variant="ghost" />
      <Button {...args} variant="neutral" />
      <Button {...args} disabled />
    </Stack>
  ),
};

export const Sizes: Story = {
  render: (args) => (
    <Stack direction="row" sx={{ gap: 2, alignItems: 'center' }}>
      <Button {...args} size="sm" />
      <Button {...args} size="md" />
      <Button {...args} size="lg" />
    </Stack>
  ),
};

export const WithIcon: Story = {
  args: { startIcon: <Plus size={18} />, children: '新增' },
};

/** BTN-109, BTN-110, BTN-111: a toolbar's tool buttons. */
export const Toolbar: Story = {
  render: () => (
    <Stack direction="row" sx={{ gap: 1, alignItems: 'center' }}>
      <Button variant="neutral" startIcon={<Filter size={16} />} count={2}>
        篩選
      </Button>
      <Button
        variant="neutral"
        startIcon={<ClipboardCheck size={16} />}
        count={5}
        countTone="warning"
      >
        審查
      </Button>
      <Button variant="neutral" aria-expanded>
        匯出
      </Button>
    </Stack>
  ),
};

/** BTN-103, BTN-105, BTN-106, BTN-107. */
export const States: Story = {
  render: () => (
    <Stack direction="row" sx={{ gap: 1, alignItems: 'center' }}>
      <Button variant="outline" tone="danger" startIcon={<Trash2 size={16} />}>
        丟棄草稿
      </Button>
      <Button loading>送出中</Button>
      <Button variant="neutral" iconOnly aria-label="篩選">
        <Filter size={16} />
      </Button>
      <Button variant="outline" selected>
        列表
      </Button>
      <Button variant="outline" selected={false}>
        地圖
      </Button>
    </Stack>
  ),
};
