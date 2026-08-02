'use client';

import { Suspense, type ReactNode } from 'react';

import { Icons } from '@rescue-frontend/ui';

import type { SidebarResolvedContent } from '../sidebar';
import { SidebarPanel } from '../sidebar';
import { useSiteRouteState } from '../../route';
import { SITE_MODULES } from '../../route/constants';
import { createSiteHref } from '../../route/serialize';
import type { SiteModule, SiteRouteState } from '../../route/types';

const MapIcon = Icons.map;
const DataGridIcon = Icons.dataGrid;
const PersonIcon = Icons.person;

const SITE_MODULE_META: Record<SiteModule, { label: string; icon: ReactNode }> =
  {
    map: { label: '地圖', icon: <MapIcon /> },
    list: { label: '列表', icon: <DataGridIcon /> },
  };

/**
 * 依目前模組與路由狀態建立側欄內容。
 * 各模組連結以 {@link createSiteHref} 帶上現有狀態，切換時保留篩選與詳情。
 */
function buildSiteSidebarContent(
  module: SiteModule,
  state: SiteRouteState,
  isAuthenticated?: boolean,
  onSignIn?: () => void,
  onSignOut?: () => void,
): SidebarResolvedContent {
  return {
    navigationItems: SITE_MODULES.map((target) => ({
      id: target,
      label: SITE_MODULE_META[target].label,
      icon: SITE_MODULE_META[target].icon,
      selected: target === module,
      fontWeight: 600,
      path: createSiteHref(target, state),
    })),
    footerActions: isAuthenticated
      ? []
      : [
          {
            id: 'login',
            label: '登入',
            icon: <PersonIcon />,
            onClick: onSignIn,
          },
        ],
  };
}

interface SiteSidebarProps {
  isAuthenticated?: boolean;
  onSignIn?: () => void;
  open: boolean;
  width?: number | string;
  collapsedWidth?: number | string;
  minHeight?: number | string;
  headerContent?: ReactNode;
  showCloseButton?: boolean;
  onClose?: () => void;
  onSignOut?: () => void;
}

function SiteSidebarConnected(props: SiteSidebarProps) {
  const { module, state } = useSiteRouteState();
  const { isAuthenticated, onSignIn, onSignOut, ...panelProps } = props;

  return (
    <SidebarPanel
      content={buildSiteSidebarContent(
        module,
        state,
        isAuthenticated,
        onSignIn,
        onSignOut,
      )}
      {...panelProps}
    />
  );
}

function SiteSidebarFallback(props: SiteSidebarProps) {
  const { isAuthenticated, onSignIn, onSignOut, ...panelProps } = props;

  return (
    <SidebarPanel
      content={buildSiteSidebarContent(
        'map',
        {},
        isAuthenticated,
        onSignIn,
        onSignOut,
      )}
      {...panelProps}
    />
  );
}

/**
 * 前台側欄：沿用後台側欄 UI，模組選項改為地圖 / 列表。
 * 以 Suspense 包覆讀取網址狀態的部分，避免內容區重新掛載。
 */
export function SiteSidebar(props: SiteSidebarProps) {
  return (
    <Suspense fallback={<SiteSidebarFallback {...props} />}>
      <SiteSidebarConnected {...props} />
    </Suspense>
  );
}
