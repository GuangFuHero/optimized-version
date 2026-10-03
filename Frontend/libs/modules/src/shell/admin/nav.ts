import {
  Building2,
  ClipboardList,
  Megaphone,
  Package,
  UserCog,
  BookOpen,
  MapPin,
  Settings,
  LayoutDashboard,
  ShieldCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { usePathname } from 'next/navigation';

export interface AdminNavItem {
  id: string;
  label: string;
  href: string;
  Icon: LucideIcon;
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
        Icon: LayoutDashboard,
      },
      {
        id: 'map',
        label: '互助地圖',
        href: '/admin/map',
        Icon: MapPin,
      },
      {
        id: 'tickets',
        label: '任務管理',
        href: '/admin/tickets',
        Icon: ClipboardList,
      },
      {
        id: 'stations',
        label: '資源站點管理',
        href: '/admin/stations',
        Icon: Package,
      },
      {
        id: 'announcements',
        label: '緊急公告',
        href: '/admin/announcements',
        Icon: Megaphone,
      },
      {
        id: 'briefings',
        label: '志工行前資訊',
        href: '/admin/briefings',
        Icon: BookOpen,
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
        Icon: Building2,
      },
      {
        id: 'members',
        label: '成員與權限',
        href: '/admin/users',
        Icon: UserCog,
      },
      {
        id: 'audit',
        label: '資料檢核',
        href: '/admin/audit',
        Icon: ShieldCheck,
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
        Icon: Settings,
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
