import { Plus } from 'lucide-react';

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
