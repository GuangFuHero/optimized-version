import { Button, Typography } from '@mui/material';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { Dialog, type DialogProps } from './index';

function DialogDemo(props: Omit<DialogProps, 'open' | 'onClose'>) {
  const [open, setOpen] = useState(true);

  return (
    <>
      <Button variant="outlined" onClick={() => setOpen(true)}>
        開啟
      </Button>
      <Dialog {...props} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

const meta = {
  title: 'Components/Dialog',
  component: Dialog,
  render: (args) => <DialogDemo {...args} />,
  args: {
    open: true,
    onClose: () => undefined,
    onConfirm: () => undefined,
    title: '撤回這筆申請？',
    confirmLabel: '撤回申請',
    children: (
      <Typography>撤回後這筆申請會取消，要再申請得重新填寫。</Typography>
    ),
  },
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};

export const Danger: Story = {
  args: { title: '刪除整張單？', confirmLabel: '刪除', confirmTone: 'danger' },
};

export const WithError: Story = {
  args: { error: '網路連線失敗，請稍後再試。' },
};

export const Submitting: Story = {
  args: { submitting: true, confirmLabel: '撤回中...' },
};
