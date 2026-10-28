'use client';

import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import LoginRoundedIcon from '@mui/icons-material/LoginRounded';
import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded';
import { Box, IconButton, Stack, Typography } from '@mui/material';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense } from 'react';

import {
  designTokens,
  displayTextSize,
  SidebarItem,
} from '@rescue-frontend/ui';

import HandshakeRoundedIcon from '@mui/icons-material/HandshakeRounded';
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded';
import VerifiedRoundedIcon from '@mui/icons-material/VerifiedRounded';
import { BACK_OFFICE_HREF, type SitePortalEntry } from '../../role-request';
import { openHelpRequest } from '../../ticket/help-request/open-help-request';
import { BRIEFING_HREF } from '../../briefing/href';
import { SiteBrandName } from './brand-name';
import { PageHelpIcon } from './page-help';

import { GuangFuBrandIcon } from '../../brand';
import { isSiteModulePath, useSiteRouteState } from '../../route';
import { SITE_MODULES } from '../../route/constants';
import { SITE_MODULE_META } from '../../route/module-meta';
import { createSiteHref } from '../../route/serialize';
import type { SiteModule, SiteRouteState } from '../../route/types';

const { color, shadow, typography, motion } = designTokens;

interface SiteSidebarProps {
  collapsed?: boolean;
  isAuthenticated?: boolean;
  onSignIn?: () => void;
  onClose?: () => void;
  onSignOut?: () => void;
  portalEntry?: SitePortalEntry;
  onApplyRoleRequest?: () => void;
  pageHelp?: { fresh: boolean; onOpen: () => void };
}

export function SiteSidebar(props: SiteSidebarProps) {
  const pathname = usePathname();

  return (
    <Suspense
      fallback={
        <SiteSidebarNav
          {...props}
          module="map"
          state={{}}
          pathname={pathname}
        />
      }
    >
      <RoutedSiteSidebarNav {...props} pathname={pathname} />
    </Suspense>
  );
}

function RoutedSiteSidebarNav(props: SiteSidebarProps & { pathname: string }) {
  const { module, state } = useSiteRouteState();

  return <SiteSidebarNav {...props} module={module} state={state} />;
}

/** The small grey heading over a group of entries; gone when the sidebar is folded to its icons. */
function SidebarGroupLabel({ children }: { children: string }) {
  return (
    <Typography
      sx={{
        px: '8px',
        pb: '4px',
        fontFamily: typography.label[300].fontFamily,
        fontSize: displayTextSize[11],
        fontWeight: 700,
        lineHeight: 1.4,
        letterSpacing: '0.08em',
        color: color.fg.neutral.muted,
      }}
    >
      {children}
    </Typography>
  );
}

function SiteSidebarNav({
  module,
  state,
  pathname,
  collapsed = false,
  isAuthenticated = false,
  onSignIn,
  onClose,
  portalEntry,
  onApplyRoleRequest,
  pageHelp,
}: SiteSidebarProps & {
  module: SiteModule;
  state: SiteRouteState;
  pathname: string;
}) {
  const onModulePage = isSiteModulePath(pathname);

  return (
    <Stack
      component="nav"
      aria-label="前台模組"
      sx={{
        height: '100%',
        gap: '8px',
        p: '16px 12px',
        alignItems: collapsed ? 'center' : 'stretch',
        overflow: 'hidden',
        bgcolor: color.bg.neutral.default,
        borderRight: `1px solid ${color.border.default}`,
        boxShadow: collapsed || onClose ? 'none' : shadow.md,
        transition: `box-shadow ${motion.transition.base}`,
      }}
    >
      {onClose ? (
        <Stack
          direction="row"
          sx={{ alignItems: 'center', gap: '10px', pb: '16px' }}
        >
          <GuangFuBrandIcon width={38} height={26} />
          {/* The phone's top bar has no room for the name, so the drawer has it (`site-shell.jsx:722`). */}
          <SiteBrandName
            sx={{
              flex: 1,
              minWidth: 0,
              fontSize: displayTextSize[20],
              lineHeight: '28px',
              fontWeight: 700,
              color: color.fg.neutral.default,
            }}
          />
          <IconButton
            aria-label="關閉選單"
            onClick={onClose}
            sx={{ color: color.fg.neutral.subtle }}
          >
            <CloseRoundedIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Stack>
      ) : null}

      {collapsed ? null : <SidebarGroupLabel>檢視模式</SidebarGroupLabel>}

      {SITE_MODULES.map((target) => {
        const { label, Icon } = SITE_MODULE_META[target];

        return (
          <SidebarItem
            key={target}
            LinkComponent={Link}
            href={createSiteHref(target, state)}
            icon={<Icon />}
            label={label}
            active={onModulePage && target === module}
            collapsed={collapsed}
          />
        );
      })}

      {/* A section of its own, not a third 檢視模式: the map and the list are two views of the same
          things, the briefing is something else to read (prototype `site-shell.jsx:617-628`). */}
      <Box
        sx={{
          height: '1px',
          flexShrink: 0,
          alignSelf: 'stretch',
          mx: '8px',
          my: '8px',
          bgcolor: color.border.default,
        }}
      />
      {collapsed ? null : <SidebarGroupLabel>出發前</SidebarGroupLabel>}
      <SidebarItem
        LinkComponent={Link}
        href={BRIEFING_HREF}
        icon={<MenuBookRoundedIcon />}
        label="行前資訊"
        active={pathname === BRIEFING_HREF}
        collapsed={collapsed}
        onClick={() => onClose?.()}
      />

      <Stack sx={{ mt: 'auto', gap: '8px' }}>
        <SidebarItem
          icon={<HandshakeRoundedIcon />}
          label="請求協助"
          collapsed={collapsed}
          onClick={() => {
            onClose?.();
            openHelpRequest();
          }}
        />
        {pageHelp ? (
          <SidebarItem
            icon={<PageHelpIcon fresh={pageHelp.fresh} />}
            label="這一頁怎麼用"
            collapsed={collapsed}
            onClick={() => {
              onClose?.();
              pageHelp.onOpen();
            }}
          />
        ) : null}
        {portalEntry === 'backOffice' ? (
          <SidebarItem
            LinkComponent={Link}
            href={BACK_OFFICE_HREF}
            icon={<SwapHorizRoundedIcon />}
            label="前往管理平台"
            collapsed={collapsed}
          />
        ) : null}
        {portalEntry === 'apply' ? (
          <SidebarItem
            icon={<VerifiedRoundedIcon />}
            label="申請管理權限"
            collapsed={collapsed}
            onClick={onApplyRoleRequest}
          />
        ) : null}
        {isAuthenticated ? null : (
          <SidebarItem
            icon={<LoginRoundedIcon />}
            label="登入"
            collapsed={collapsed}
            onClick={onSignIn}
            sx={{ mt: 'auto' }}
          />
        )}
      </Stack>
    </Stack>
  );
}
