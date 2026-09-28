import { Stack } from '@mui/material';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { Avatar } from './index';

const meta = {
  title: 'Components/Avatar',
  component: Avatar,
  args: { name: '林承翰', size: 40, tone: 'primary' },
  argTypes: {
    tone: {
      control: 'inline-radio',
      options: ['primary', 'secondary', 'neutral'],
    },
    size: { control: { type: 'number', min: 16, max: 96 } },
  },
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Initials: Story = {};
export const LatinName: Story = { args: { name: 'Carol Chen' } };

export const Tones: Story = {
  render: (args) => (
    <Stack direction="row" sx={{ gap: 2 }}>
      <Avatar {...args} tone="primary" />
      <Avatar {...args} tone="secondary" />
      <Avatar {...args} tone="neutral" />
    </Stack>
  ),
};
