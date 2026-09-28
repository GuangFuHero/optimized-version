import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import PublicRoundedIcon from '@mui/icons-material/PublicRounded';
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import { Stack } from '@mui/material';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { Badge, type BadgeTone, type BadgeVariant } from './index';

const TONES: BadgeTone[] = [
  'neutral',
  'primary',
  'secondary',
  'success',
  'warning',
  'danger',
  'info',
];
const VARIANTS: BadgeVariant[] = ['subtle', 'solid', 'outline'];

const meta = {
  title: 'Components/Badge',
  component: Badge,
  args: { children: '進行中', tone: 'primary', variant: 'subtle', size: 'md' },
  argTypes: {
    tone: { control: 'select', options: TONES },
    variant: { control: 'inline-radio', options: [...VARIANTS, 'dashed'] },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AllTones: Story = {
  render: (args) => (
    <Stack sx={{ gap: 1.5 }}>
      {VARIANTS.map((variant) => (
        <Stack key={variant} direction="row" sx={{ gap: 1 }}>
          {TONES.map((tone) => (
            <Badge key={tone} {...args} tone={tone} variant={variant}>
              {tone}
            </Badge>
          ))}
        </Stack>
      ))}
    </Stack>
  ),
};

export const Sizes: Story = {
  render: (args) => (
    <Stack direction="row" sx={{ gap: 1, alignItems: 'center' }}>
      <Badge {...args} size="sm" />
      <Badge {...args} size="md" />
      <Badge {...args} size="lg" />
    </Stack>
  ),
};

export const WithIcon: Story = {
  render: () => (
    <Stack direction="row" sx={{ gap: 1 }}>
      <Badge tone="neutral" icon={<VerifiedUserOutlinedIcon />}>
        管理後台
      </Badge>
      <Badge tone="neutral" icon={<PublicRoundedIcon />}>
        公開頁面
      </Badge>
      <Badge tone="warning" size="lg" icon={<ScheduleRoundedIcon />}>
        逾時 3 小時
      </Badge>
    </Stack>
  ),
};

export const Pending: Story = {
  args: {
    variant: 'dashed',
    size: 'sm',
    icon: <HelpOutlineRoundedIcon />,
    children: '資料待確認',
    title: '聯絡方式變更流程待工程確認',
  },
};
