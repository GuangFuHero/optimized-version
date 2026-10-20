import type { Meta, StoryObj } from '@storybook/react-vite';

import { Callout } from './index';

const meta = {
  title: 'Components/Callout',
  component: Callout,
  args: {
    children:
      '電話與 Email 同時是登入方式。變更後需要驗證新的收件端、並通知舊的收件端才會生效，在那之前原本的還可以登入。',
  },
} satisfies Meta<typeof Callout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Info: Story = {};

export const Success: Story = { args: { tone: 'success', children: '已儲存' } };

export const Warning: Story = {
  args: { tone: 'warning', children: '這個電話尚未驗證。' },
};

export const Danger: Story = {
  args: { tone: 'danger', children: '驗證碼錯誤或已過期。' },
};
