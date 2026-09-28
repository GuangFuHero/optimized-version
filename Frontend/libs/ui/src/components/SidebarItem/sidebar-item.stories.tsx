import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import SpaceDashboardOutlinedIcon from '@mui/icons-material/SpaceDashboardOutlined';
import { Stack } from '@mui/material';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { SidebarItem } from './index';

const meta = {
  title: 'Components/SidebarItem',
  component: SidebarItem,
  args: {
    icon: <SpaceDashboardOutlinedIcon />,
    label: '總覽儀表板',
    active: false,
    collapsed: false,
  },
  decorators: [
    (Story) => (
      <Stack sx={{ width: 220 }}>
        <Story />
      </Stack>
    ),
  ],
} satisfies Meta<typeof SidebarItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Active: Story = { args: { active: true } };
export const Collapsed: Story = { args: { collapsed: true } };
export const CollapsedActive: Story = {
  args: { collapsed: true, active: true },
};

export const Group: Story = {
  render: ({ collapsed }) => (
    <Stack sx={{ gap: '6px', alignItems: collapsed ? 'center' : 'stretch' }}>
      <SidebarItem
        icon={<SpaceDashboardOutlinedIcon />}
        label="總覽儀表板"
        collapsed={collapsed}
        active
      />
      <SidebarItem
        icon={<PlaceOutlinedIcon />}
        label="互助地圖"
        collapsed={collapsed}
      />
      <SidebarItem
        icon={<AssignmentOutlinedIcon />}
        label="任務管理"
        collapsed={collapsed}
      />
    </Stack>
  ),
};
