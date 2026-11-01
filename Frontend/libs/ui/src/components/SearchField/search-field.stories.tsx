import { Stack } from '@mui/material';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { SearchField } from './index';

const meta = {
  title: 'Components/SearchField',
  component: SearchField,
  args: { placeholder: '搜尋標題／描述／需求…' },
} satisfies Meta<typeof SearchField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Sizes: Story = {
  render: (args) => (
    <Stack sx={{ gap: 2, maxWidth: 320 }}>
      <SearchField {...args} size="sm" />
      <SearchField {...args} size="md" />
    </Stack>
  ),
};
