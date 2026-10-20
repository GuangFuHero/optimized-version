import { Phone } from 'lucide-react';

import type { Meta, StoryObj } from '@storybook/react-vite';

import { TextInput } from './index';

const meta = {
  title: 'Components/TextInput',
  component: TextInput,
  args: {
    label: '電話',
    hint: '登入方式',
    defaultValue: '0912-345-678',
    leadingIcon: <Phone size={17} />,
  },
} satisfies Meta<typeof TextInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Required: Story = {
  args: {
    label: '名字',
    hint: undefined,
    required: true,
    helperText: '不是登入帳號，儲存後立即生效。',
    leadingIcon: undefined,
  },
};

export const Invalid: Story = {
  args: { error: '手機號碼格式不正確（09 開頭十碼，或 +886 格式）' },
};

export const Disabled: Story = { args: { disabled: true } };
