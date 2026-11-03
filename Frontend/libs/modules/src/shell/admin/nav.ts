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
  ScanSearch,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useCurrentUser } from '@rescue-frontend/data-access/admin';
import type { components } from '@rescue-frontend/data-access/openapi';

export interface AdminNavItem {
  id: string;
  label: string;
  href: string;
  Icon: LucideIcon;
  description: string;
  capability?: components['schemas']['Perm'];
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
        href: '/dashboard',
        Icon: LayoutDashboard,
        description: '整體狀況與數字',
      },
      {
        id: 'map',
        label: '互助地圖',
        href: '/map',
        Icon: MapPin,
        description: '責任區、危險區與標示區',
        capability: 'map.view',
      },
      {
        id: 'tickets',
        label: '任務管理',
        href: '/tickets',
        Icon: ClipboardList,
        description: '任務單、指派與進度',
        capability: 'ticket.view',
      },
      {
        id: 'stations',
        label: '資源站點管理',
        href: '/stations',
        Icon: Package,
        description: '資源站點與修改建議',
        capability: 'station.view',
      },
      {
        id: 'announcements',
        label: '緊急公告',
        href: '/announcements',
        Icon: Megaphone,
        description: '前台與後台的緊急公告',
        capability: 'announcement.view_admin',
      },
      {
        id: 'briefings',
        label: '志工行前資訊',
        href: '/briefings',
        Icon: BookOpen,
        description: '給志工的行前資訊',
        capability: 'pre_departure.edit',
      },
    ],
  },
  {
    label: '協作與權限',
    items: [
      {
        id: 'teams',
        label: '團隊',
        href: '/teams',
        Icon: Building2,
        description: '團隊與成員',
        capability: 'team.view',
      },
      {
        id: 'members',
        label: '成員與權限',
        href: '/users',
        Icon: UserCog,
        description: '全平台人員與權限',
        capability: 'user.view',
      },
      {
        id: 'audit',
        // DEDUP-008 decision 1: 重複審核, no "AI"; 資料檢核 is the separate ticket data check.
        label: '重複審核',
        href: '/audit',
        Icon: ScanSearch,
        description: '可能重複的任務單與站點',
        capability: 'ai_duplicate.view',
      },
    ],
  },
  {
    footer: true,
    items: [
      {
        id: 'settings',
        label: '設定',
        href: '/settings',
        Icon: Settings,
        description: '平台設定',
        capability: 'project.view',
      },
    ],
  },
];

export function useAdminNavSections() {
  const { data: user } = useCurrentUser();

  return ADMIN_NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) =>
        !item.capability || user?.capabilities.includes(item.capability),
    ),
  })).filter((section) => section.items.length > 0);
}

export function useActiveAdminNavItem() {
  const pathname = usePathname();

  return ADMIN_NAV_SECTIONS.flatMap((section) => section.items).find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
}
