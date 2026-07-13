import { Icons } from '@rescue-frontend/ui';

import type { SidebarMenuItemData } from '../sidebar-menu-item';

export interface SidebarResolvedContent {
  //   primaryAction: SidebarMenuItemData;
  navigationItems: readonly SidebarMenuItemData[];
  footerActions: readonly SidebarMenuItemData[];
}

// const PlusIcon = Icons.plus;
const MapIcon = Icons.map;
const DataGridIcon = Icons.dataGrid;
const ResourcesIcon = Icons.resources;
const IncidentLogIcon = Icons.incidentLog;
const UserManagementIcon = Icons.userManagement;
const SettingsIcon = Icons.settings;
const SupportIcon = Icons.support;
const PersonIcon = Icons.person;

// function createDefaultPrimaryAction(): SidebarMenuItemData {
//   return {
//     id: 'create-ticket',
//     label: '新增任務',
//     icon: <PlusIcon />,
//     ariaLabel: '新增任務',
//   };
// }

function isActiveSidebarPath(pathname: string | undefined, path: string) {
  if (!pathname) {
    return path === '/admin/map';
  }

  return pathname === path || pathname.startsWith(`${path}/`);
}

function createDefaultNavigationItems(
  pathname?: string,
): readonly SidebarMenuItemData[] {
  return [
    {
      id: 'map',
      label: '地圖',
      icon: <MapIcon />,
      selected: isActiveSidebarPath(pathname, '/admin/map'),
      fontWeight: 600,
      path: '/admin/map',
    },
    {
      id: 'tickets',
      label: '任務管理',
      icon: <DataGridIcon />,
      selected: isActiveSidebarPath(pathname, '/admin/tickets'),
      fontWeight: 600,
      path: '/admin/tickets',
    },
    {
      id: 'stations',
      label: '資源站點',
      icon: <ResourcesIcon />,
      selected: isActiveSidebarPath(pathname, '/admin/stations'),
      fontWeight: 600,
      path: '/admin/stations',
    },
    {
      id: 'logs',
      label: '事件記錄',
      icon: <IncidentLogIcon />,
      selected: isActiveSidebarPath(pathname, '/admin/logs'),
      fontWeight: 600,
      path: '/admin/logs',
    },
    {
      id: 'users',
      label: '用戶管理',
      icon: <UserManagementIcon />,
      selected: isActiveSidebarPath(pathname, '/admin/users'),
      fontWeight: 700,
      path: '/admin/users',
    },
  ];
}

function createDefaultFooterActions(
  onSignOut?: () => void,
): readonly SidebarMenuItemData[] {
  const actions: SidebarMenuItemData[] = [
    {
      id: 'settings',
      label: '設定',
      icon: <SettingsIcon />,
      path: '/admin/settings',
    },
    {
      id: 'support',
      label: '支援',
      icon: <SupportIcon />,
      path: '/admin/support',
    },
  ];

  if (onSignOut) {
    actions.push({
      id: 'logout',
      label: '登出',
      icon: <PersonIcon />,
      onClick: onSignOut,
    });
  }

  return actions;
}

export function resolveSidebarContent(
  pathname?: string,
  onSignOut?: () => void,
): SidebarResolvedContent {
  return {
    // primaryAction: createDefaultPrimaryAction(),
    navigationItems: createDefaultNavigationItems(pathname),
    footerActions: createDefaultFooterActions(onSignOut),
  };
}
