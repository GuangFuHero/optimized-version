'use client';

import { Suspense, type ReactNode } from 'react';

import HandshakeRoundedIcon from '@mui/icons-material/HandshakeRounded';
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded';
import VerifiedRoundedIcon from '@mui/icons-material/VerifiedRounded';

import { Icons } from '@rescue-frontend/ui';

import { BACK_OFFICE_HREF, type SitePortalEntry } from '../../role-request';
import type { SidebarMenuItemData } from '../admin/components/sidebar-menu-item';
import type { SidebarResolvedContent } from '../sidebar';
import { SidebarPanel } from '../sidebar';
import { useSiteRouteState } from '../../route';
import { openHelpRequest } from '../../ticket/help-request/open-help-request';
import { SITE_MODULES } from '../../route/constants';
import { SITE_MODULE_META } from '../../route/module-meta';
import { createSiteHref } from '../../route/serialize';
import type { SiteModule, SiteRouteState } from '../../route/types';
import { PageHelpIcon } from './page-help';

const PersonIcon = Icons.person;

/** 這一頁怎麼用 in the phone's menu, which its top bar has no room for (spec S9). */
interface SiteMenuPageHelp {
  /** Not opened on this device yet: the row's ？ carries a dot. */
  fresh: boolean;
  onOpen: () => void;
}

/** The row, when the page has help: the menu shuts first, as for 請求協助. */
function pageHelpFooterActions(
  pageHelp: SiteMenuPageHelp | undefined,
  onClose?: () => void,
): SidebarMenuItemData[] {
  if (!pageHelp) {
    return [];
  }

  return [
    {
      id: 'page-help',
      label: '這一頁怎麼用',
      icon: <PageHelpIcon fresh={pageHelp.fresh} />,
      onClick: () => {
        onClose?.();
        pageHelp.onOpen();
      },
    },
  ];
}

/** The menu's back-office entry: a link to the back office, or a button that opens the application. */
function portalFooterActions(
  portalEntry: SitePortalEntry,
  onApplyRoleRequest?: () => void,
): SidebarMenuItemData[] {
  if (portalEntry === 'backOffice') {
    return [
      {
        id: 'back-office',
        label: '前往後台',
        icon: <SwapHorizRoundedIcon />,
        path: BACK_OFFICE_HREF,
      },
    ];
  }

  if (portalEntry === 'apply') {
    return [
      {
        id: 'apply-back-office',
        label: '申請成為後台人員',
        icon: <VerifiedRoundedIcon />,
        onClick: onApplyRoleRequest,
      },
    ];
  }

  return [];
}

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
  portalEntry: SitePortalEntry = 'none',
  onApplyRoleRequest?: () => void,
  onClose?: () => void,
  pageHelp?: SiteMenuPageHelp,
): SidebarResolvedContent {
  return {
    navigationItems: SITE_MODULES.map((target) => {
      const { label, Icon } = SITE_MODULE_META[target];

      return {
        id: target,
        label,
        icon: <Icon />,
        selected: target === module,
        fontWeight: 600,
        path: createSiteHref(target, state),
      };
    }),
    footerActions: [
      // First at the foot (prototype site-shell.jsx:588-590), and for guests too: the drawer asks
      // them to sign in before sending, not before starting. The phone's menu shuts first, or it
      // would sit open under the drawer.
      {
        id: 'request-help',
        label: '請求協助',
        icon: <HandshakeRoundedIcon />,
        onClick: () => {
          onClose?.();
          openHelpRequest();
        },
      },
      // Then, as the prototype orders it (`site-shell.jsx:588-598`), 這一頁怎麼用 and the
      // back-office entry, which a phone's top bar has no room for, then 登入 for a guest.
      ...pageHelpFooterActions(pageHelp, onClose),
      ...portalFooterActions(portalEntry, onApplyRoleRequest),
      ...(isAuthenticated
        ? []
        : [
            {
              id: 'login',
              label: '登入',
              icon: <PersonIcon />,
              onClick: onSignIn,
            },
          ]),
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
  /**
   * The back-office entry at the foot of the menu. Only the phone's menu drawer is given one: on a
   * desktop the top bar carries it, and the prototype shows it once.
   */
  portalEntry?: SitePortalEntry;
  /** 申請成為後台人員 in the menu: opens the application drawer, which the shell holds. */
  onApplyRoleRequest?: () => void;
  /** 這一頁怎麼用 at the foot of the menu: like the back-office entry, the phone's menu only. */
  pageHelp?: SiteMenuPageHelp;
}

function SiteSidebarConnected(props: SiteSidebarProps) {
  const { module, state } = useSiteRouteState();
  const {
    isAuthenticated,
    onSignIn,
    onSignOut,
    portalEntry,
    onApplyRoleRequest,
    pageHelp,
    ...panelProps
  } = props;

  return (
    <SidebarPanel
      content={buildSiteSidebarContent(
        module,
        state,
        isAuthenticated,
        onSignIn,
        onSignOut,
        portalEntry,
        onApplyRoleRequest,
        panelProps.onClose,
        pageHelp,
      )}
      {...panelProps}
    />
  );
}

function SiteSidebarFallback(props: SiteSidebarProps) {
  const {
    isAuthenticated,
    onSignIn,
    onSignOut,
    portalEntry,
    onApplyRoleRequest,
    pageHelp,
    ...panelProps
  } = props;

  return (
    <SidebarPanel
      content={buildSiteSidebarContent(
        'map',
        {},
        isAuthenticated,
        onSignIn,
        onSignOut,
        portalEntry,
        onApplyRoleRequest,
        panelProps.onClose,
        pageHelp,
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
