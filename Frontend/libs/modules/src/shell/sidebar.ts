import type { SidebarMenuItemData } from './admin/components/sidebar-menu-item';

export interface SidebarResolvedContent {
  navigationItems: readonly SidebarMenuItemData[];
  footerActions: readonly SidebarMenuItemData[];
}

export { SidebarPanel } from './admin/components/sidebar/parts';
