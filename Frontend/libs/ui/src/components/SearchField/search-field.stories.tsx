import { Stack } from '@mui/material';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { SearchField } from './index';

const meta = {
  title: 'Components/SearchField',
  component: SearchField,
  args: { placeholder: '搜尋標題／描述／需求…', 'aria-label': '搜尋任務單' },
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

/** A note on what is typed, inside the box on the right: the box keeps its size. */
export const WithHint: Story = {
  args: { defaultValue: '水', hint: '請輸入 2–50 個字' },
  render: (args) => (
    <Stack sx={{ maxWidth: 320 }}>
      <SearchField {...args} />
    </Stack>
  ),
};
