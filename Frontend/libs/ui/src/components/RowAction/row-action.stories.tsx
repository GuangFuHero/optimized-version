import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { Stack } from '@mui/material';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { RowAction } from './index';

const meta = {
  title: 'Components/RowAction',
  component: RowAction,
  args: {
    label: '編輯',
    icon: <EditOutlinedIcon sx={{ fontSize: 14 }} />,
    tone: 'default',
    disabled: false,
  },
  argTypes: {
    tone: { control: 'inline-radio', options: ['default', 'danger'] },
  },
} satisfies Meta<typeof RowAction>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Danger: Story = {
  args: {
    tone: 'danger',
    label: '刪除',
    icon: <DeleteOutlineRoundedIcon sx={{ fontSize: 14 }} />,
  },
};
export const Disabled: Story = { args: { disabled: true } };
export const DisabledDanger: Story = {
  args: {
    tone: 'danger',
    disabled: true,
    label: '刪除',
    icon: <DeleteOutlineRoundedIcon sx={{ fontSize: 14 }} />,
  },
};

export const InARow: Story = {
  render: () => (
    <Stack direction="row" sx={{ gap: 1 }}>
      <RowAction
        label="編輯"
        icon={<EditOutlinedIcon sx={{ fontSize: 14 }} />}
      />
      <RowAction
        tone="danger"
        label="刪除"
        icon={<DeleteOutlineRoundedIcon sx={{ fontSize: 14 }} />}
      />
    </Stack>
  ),
};
