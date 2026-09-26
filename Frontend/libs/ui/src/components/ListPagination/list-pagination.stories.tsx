import type { Meta, StoryObj } from '@storybook/react-vite';
import { useArgs } from 'storybook/preview-api';

import { ListPagination, type ListPaginationProps } from './index';

const meta = {
  title: 'Components/ListPagination',
  component: ListPagination,
  args: { page: 1, pageCount: 10, showPageNumbers: true },
  argTypes: {
    page: { control: { type: 'number', min: 1 } },
    pageCount: { control: { type: 'number', min: 1 } },
  },
  render: function PaginationStory(args) {
    const [, updateArgs] = useArgs<ListPaginationProps>();

    return (
      <ListPagination
        {...args}
        onPageChange={(page) => {
          updateArgs({ page });
          args.onPageChange?.(page);
        }}
      />
    );
  },
} satisfies Meta<typeof ListPagination>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Numbered: Story = {};
export const ArrowsOnly: Story = { args: { showPageNumbers: false } };
export const SinglePage: Story = { args: { pageCount: 1 } };
export const LastPage: Story = { args: { page: 10 } };
