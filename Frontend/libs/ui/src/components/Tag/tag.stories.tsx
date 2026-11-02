import { ShieldCheck } from 'lucide-react';

import { Stack } from '@mui/material';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { designTokens } from '../../theme';
import { Tag, type TagFill, type TagTone } from './index';

const TONES: TagTone[] = [
  'neutral',
  'info',
  'secondary',
  'success',
  'warning',
  'danger',
  'brand',
];
const FILLS: TagFill[] = ['subtle', 'solid', 'quiet'];

const meta = {
  title: 'Components/Tag',
  component: Tag,
  args: { children: '緊急', tone: 'warning', fill: 'subtle', size: 'md' },
  argTypes: {
    tone: { control: 'select', options: TONES },
    fill: { control: 'inline-radio', options: FILLS },
    size: { control: 'inline-radio', options: ['sm', 'md'] },
  },
} satisfies Meta<typeof Tag>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AllTones: Story = {
  render: (args) => (
    <Stack sx={{ gap: 1.5 }}>
      {FILLS.map((fill) => (
        <Stack key={fill} direction="row" sx={{ gap: 1 }}>
          {TONES.map((tone) => (
            <Tag key={tone} {...args} tone={tone} fill={fill}>
              {tone}
            </Tag>
          ))}
        </Stack>
      ))}
    </Stack>
  ),
};

/** The design's own table: priorities, a ticket's status, a station, a disaster type, official. */
export const InUse: Story = {
  render: () => (
    <Stack
      direction="row"
      sx={{ gap: 1, flexWrap: 'wrap', alignItems: 'center' }}
    >
      <Tag tone="danger" fill="solid">
        生命危急
      </Tag>
      <Tag tone="warning">緊急</Tag>
      <Tag fill="quiet">一般</Tag>
      <Tag fill="quiet" strong dot={designTokens.color.bg.primary.default}>
        待處理
      </Tag>
      <Tag tone="success">開設中</Tag>
      <Tag hue="#2592B9" dot>
        水災
      </Tag>
      <Tag tone="info" icon={<ShieldCheck size={13} />}>
        官方
      </Tag>
      <Tag onRemove={() => undefined}>光復鄉</Tag>
    </Stack>
  ),
};
