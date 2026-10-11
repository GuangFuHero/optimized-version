import { Box, Typography } from '@mui/material';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { Badge } from '../Badge';
import { Button } from '../Button';
import { MetadataTable } from '../MetadataTable';
import { Sheet, type SheetProps } from './index';

function SheetDemo(props: Omit<SheetProps, 'open' | 'onClose'>) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        開啟
      </Button>
      <Sheet {...props} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

const meta = {
  title: 'Components/Sheet',
  component: Sheet,
  render: (args) => <SheetDemo {...args} />,
  args: {
    open: false,
    onClose: () => undefined,
    eyebrow: '#TK-1042',
    title: '民宅一樓淤泥清除',
    subtitle: '光復鄉大華村中正路一段 12 號',
    headerContent: <Badge tone="warning">待指派</Badge>,
    footer: (
      <>
        <Button variant="secondary" size="sm">
          關閉
        </Button>
        <Button size="sm">指派 Team</Button>
      </>
    ),
    children: (
      <MetadataTable
        rows={[
          { label: '需求類型', value: '清淤、物資搬運' },
          { label: '聯絡人', value: '王小明 · 0912-345-678' },
          { label: '指派 Team', value: null },
        ]}
      />
    ),
  },
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Side: Story = {};

export const LongContent: Story = {
  args: {
    children: (
      <Box>
        {Array.from({ length: 40 }, (_, i) => (
          <Typography key={i} sx={{ py: 1 }}>
            第 {i + 1} 行內容
          </Typography>
        ))}
      </Box>
    ),
  },
};

export const BottomSheetOnMobile: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};

export const NoFooter: Story = {
  args: { footer: undefined, eyebrow: undefined, headerContent: undefined },
};
