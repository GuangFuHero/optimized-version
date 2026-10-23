import { Tab } from '@mui/material';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useArgs } from 'storybook/preview-api';

import { Tabs, type TabsProps } from './index';

const meta = {
  title: 'Components/Tabs',
  component: Tabs,
  args: {
    value: 'content',
    'aria-label': '行前資訊',
    children: [
      <Tab key="content" value="content" label="內容" />,
      <Tab key="history" value="history" label="編輯紀錄" />,
      <Tab key="versions" value="versions" label="已發布版本" />,
    ],
  },
  render: function TabsStory(args) {
    const [, updateArgs] = useArgs<TabsProps>();

    return (
      <Tabs
        {...args}
        onChange={(event, value: string) => {
          updateArgs({ value });
          args.onChange?.(event, value);
        }}
      />
    );
  },
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Content: Story = {};
export const Versions: Story = { args: { value: 'versions' } };
