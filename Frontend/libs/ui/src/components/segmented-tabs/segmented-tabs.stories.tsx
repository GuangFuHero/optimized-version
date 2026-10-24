import { Tab } from '@mui/material';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useArgs } from 'storybook/preview-api';

import { SegmentedTabs, type SegmentedTabsProps } from './index';

const meta = {
  title: 'Components/SegmentedTabs',
  component: SegmentedTabs,
  args: {
    value: 'live',
    'aria-label': '公告列表',
    children: [
      <Tab key="live" value="live" label="目前公告" />,
      <Tab key="history" value="history" label="歷史紀錄" />,
    ],
  },
  render: function SegmentedTabsStory(args) {
    const [, updateArgs] = useArgs<SegmentedTabsProps>();

    return (
      <SegmentedTabs
        {...args}
        onChange={(event, value: string) => {
          updateArgs({ value });
          args.onChange?.(event, value);
        }}
      />
    );
  },
} satisfies Meta<typeof SegmentedTabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Current: Story = {};
export const History: Story = { args: { value: 'history' } };
