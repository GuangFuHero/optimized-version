import type { SvgIconComponent } from '@mui/icons-material';
import ApartmentOutlinedIcon from '@mui/icons-material/ApartmentOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import SpaceDashboardOutlinedIcon from '@mui/icons-material/SpaceDashboardOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import { usePathname } from 'next/navigation';

export interface AdminNavItem {
  id: string;
  label: string;
  href: string;
  Icon: SvgIconComponent;
}

export const ADMIN_NAV_SECTIONS: readonly {
  label?: string;
  footer?: boolean;
  items: readonly AdminNavItem[];
}[] = [
  {
    items: [
      {
        id: 'dashboard',
        label: '總覽儀表板',
        href: '/admin/dashboard',
        Icon: SpaceDashboardOutlinedIcon,
      },
      {
        id: 'map',
        label: '互助地圖',
        href: '/admin/map',
        Icon: PlaceOutlinedIcon,
      },
      {
        id: 'tickets',
        label: '任務管理',
        href: '/admin/tickets',
        Icon: AssignmentOutlinedIcon,
      },
      {
        id: 'stations',
        label: '資源站點管理',
        href: '/admin/stations',
        Icon: Inventory2OutlinedIcon,
      },
      {
        id: 'announcements',
        label: '緊急公告',
        href: '/admin/announcements',
        Icon: CampaignOutlinedIcon,
      },
      {
        id: 'briefings',
        label: '志工行前資訊',
        href: '/admin/briefings',
        Icon: MenuBookOutlinedIcon,
      },
    ],
  },
  {
    label: '協作與權限',
    items: [
      {
        id: 'teams',
        label: '團隊',
        href: '/admin/teams',
        Icon: ApartmentOutlinedIcon,
      },
      {
        id: 'members',
        label: '成員與權限',
        href: '/admin/users',
        Icon: ManageAccountsOutlinedIcon,
      },
      {
        id: 'audit',
        label: '資料檢核',
        href: '/admin/audit',
        Icon: VerifiedUserOutlinedIcon,
      },
    ],
  },
  {
    footer: true,
    items: [
      {
        id: 'settings',
        label: '設定',
        href: '/admin/settings',
        Icon: SettingsOutlinedIcon,
      },
    ],
  },
];

export function useActiveAdminNavItem() {
  const pathname = usePathname();

  return ADMIN_NAV_SECTIONS.flatMap((section) => section.items).find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
}
