import type { Meta, StoryObj } from '@storybook/react-vite';

import { AnnouncementBanner } from './index';

const meta = {
  title: 'Components/AnnouncementBanner',
  component: AnnouncementBanner,
  parameters: { layout: 'fullscreen' },
  args: { children: '今日 18:00 前需回報各隊在場人數，未回報者由縣府直接致電' },
} satisfies Meta<typeof AnnouncementBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Overflowing: Story = {
  args: {
    children:
      '光復鄉大馬村一帶道路因堰塞湖溢流全面封閉，所有志工請改走台 9 線並於 16:00 前回到集合點報到，未報到者將由各隊隊長電話確認人身安全',
  },
};
