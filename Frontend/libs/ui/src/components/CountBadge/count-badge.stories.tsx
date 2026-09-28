import { Stack, Typography } from '@mui/material';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { CountBadge, type CountBadgeTone } from './index';

const TONES: CountBadgeTone[] = ['neutral', 'primary', 'warning', 'danger'];

const meta = {
  title: 'Components/CountBadge',
  component: CountBadge,
  args: { count: 3, max: 99, tone: 'neutral' },
  argTypes: { tone: { control: 'inline-radio', options: TONES } },
} satisfies Meta<typeof CountBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Capped: Story = { args: { count: 128, tone: 'danger' } };
export const CappedAtNine: Story = {
  args: { count: 12, max: 9, tone: 'danger' },
};

export const Tones: Story = {
  render: (args) => (
    <Stack direction="row" sx={{ gap: 1 }}>
      {TONES.map((tone) => (
        <CountBadge key={tone} {...args} tone={tone} />
      ))}
    </Stack>
  ),
};

export const BesideALabel: Story = {
  render: () => (
    <Stack direction="row" sx={{ gap: 1, alignItems: 'center' }}>
      <Typography sx={{ fontWeight: 700, fontSize: 14 }}>待審核</Typography>
      <CountBadge count={4} tone="warning" />
    </Stack>
  ),
};
