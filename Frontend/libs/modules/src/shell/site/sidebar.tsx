'use client';

import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import LoginRoundedIcon from '@mui/icons-material/LoginRounded';
import { IconButton, Stack, Typography } from '@mui/material';
import Link from 'next/link';
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
import { PageHelpIcon } from './page-help';

import { GuangFuBrandIcon } from '../../brand';
import { useSiteRouteState } from '../../route';
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
  return (
    <Suspense fallback={<SiteSidebarNav {...props} module="map" state={{}} />}>
      <RoutedSiteSidebarNav {...props} />
    </Suspense>
  );
}

function RoutedSiteSidebarNav(props: SiteSidebarProps) {
  const { module, state } = useSiteRouteState();

  return <SiteSidebarNav {...props} module={module} state={state} />;
}

function SiteSidebarNav({
  module,
  state,
  collapsed = false,
  isAuthenticated = false,
  onSignIn,
  onClose,
  portalEntry,
  onApplyRoleRequest,
  pageHelp,
}: SiteSidebarProps & { module: SiteModule; state: SiteRouteState }) {
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
          <Typography
            noWrap
            sx={{
              flex: 1,
              minWidth: 0,
              fontSize: displayTextSize[20],
              lineHeight: '28px',
              fontWeight: 700,
              color: color.fg.neutral.default,
            }}
          >
            島嶼守望
          </Typography>
          <IconButton
            aria-label="關閉選單"
            onClick={onClose}
            sx={{ color: color.fg.neutral.subtle }}
          >
            <CloseRoundedIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Stack>
      ) : null}

      {collapsed ? null : (
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
          檢視模式
        </Typography>
      )}

      {SITE_MODULES.map((target) => {
        const { label, Icon } = SITE_MODULE_META[target];

        return (
          <SidebarItem
            key={target}
            LinkComponent={Link}
            href={createSiteHref(target, state)}
            icon={<Icon />}
            label={label}
            active={target === module}
            collapsed={collapsed}
          />
        );
      })}

<Stack sx={{ mt: 'auto', gap: '8px' }}>
  <SidebarItem icon={<HandshakeRoundedIcon />} label="請求協助" collapsed={collapsed} onClick={() => { onClose?.(); openHelpRequest(); }} />
  {pageHelp ? <SidebarItem icon={<PageHelpIcon fresh={pageHelp.fresh} />} label="這一頁怎麼用" collapsed={collapsed} onClick={() => { onClose?.(); pageHelp.onOpen(); }} /> : null}
  {portalEntry === 'backOffice' ? <SidebarItem LinkComponent={Link} href={BACK_OFFICE_HREF} icon={<SwapHorizRoundedIcon />} label="前往後台" collapsed={collapsed} /> : null}
  {portalEntry === 'apply' ? <SidebarItem icon={<VerifiedRoundedIcon />} label="申請成為後台人員" collapsed={collapsed} onClick={onApplyRoleRequest} /> : null}
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
