import { Plus, Upload } from 'lucide-react';

import { Stack } from '@mui/material';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { SplitButton } from './index';

const meta = {
  title: 'Components/SplitButton',
  component: SplitButton,
  args: {
    label: '新增任務',
    startIcon: <Plus size={17} />,
    onClick: () => undefined,
    items: [
      {
        label: '匯入任務單',
        icon: <Upload size={16} />,
        onClick: () => undefined,
      },
    ],
  },
} satisfies Meta<typeof SplitButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** No items, as for a viewer who may not import: one plain button, no arrow. */
export const WithoutItems: Story = {
  args: { items: [] },
};

export const Sizes: Story = {
  render: (args) => (
    <Stack direction="row" sx={{ gap: 2, alignItems: 'center' }}>
      <SplitButton {...args} size="sm" />
      <SplitButton {...args} size="md" />
      <SplitButton {...args} size="lg" />
    </Stack>
  ),
};
