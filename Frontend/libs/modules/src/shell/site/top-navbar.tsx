'use client';

import { Suspense } from 'react';

import LoginRoundedIcon from '@mui/icons-material/LoginRounded';
import PublicRoundedIcon from '@mui/icons-material/PublicRounded';
import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';

import {
  designTokens,
  displayTextSize,
  getRescueColorScheme,
} from '@rescue-frontend/ui';

import { GuangFuBrandIcon } from '../../brand';
import { SiteNotifyBell } from '../../notification';
import { SitePortalSwitch, type SitePortalEntry } from '../../role-request';
import { RequestHelpButton } from '../../ticket/help-request/request-help-button';
import {
  SiteHeaderSearchInput,
  SiteHeaderSearchInputFallback,
} from './header-search-input';
import { PageHelpButton } from './page-help';
import { SiteUserMenu } from './user-menu';

const { color, typography } = designTokens;

/**
 * 場域標籤：只回答「我現在在公開地圖，不是管理平台」。
 *
 * 只給有管理平台身份的人看，條件跟旁邊的「前往管理平台」一樣（原型 `site-shell.jsx:207-221`）：
 * 名字只在兩邊並排時才有意義，只有跨得過去的人才有並排這件事。使用者那一側不取名字，要指稱時講「公開地圖」。
 * 靜態、不可點 —— 旁邊的「前往管理平台」可以點，長得一樣會讓兩者混淆。
 * 只放桌機：手機頂欄 56px 高、360px 寬，已經被漢堡、品牌、搜尋、使用者選單佔滿。
 */
function SiteRealmBadge() {
  return (
    <Box
      component="span"
      title="你目前在公開地圖，不是管理平台"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        height: 22,
        px: '9px',
        flexShrink: 0,
        borderRadius: 999,
        bgcolor: color.bg.neutral.sunken,
        color: color.fg.neutral.subtle,
        fontFamily: typography.label[400].fontFamily,
        fontSize: displayTextSize[12],
        fontWeight: 700,
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
      }}
    >
      <PublicRoundedIcon sx={{ fontSize: 12, color: color.fg.neutral.muted }} />
      公開地圖
    </Box>
  );
}

/**
 * 前台桌機頂部導覽列：左側品牌與場域標籤，右側顯示系統身份與使用者選單。
 */
interface SiteTopNavBarProps {
  isAuthenticated?: boolean;
  userName?: string;
  /** Which back-office entry sits beside the badge (`sitePortalEntry`, worked out in the shell). */
  portalEntry?: SitePortalEntry;
  /** 申請管理權限: opens the application drawer, which the shell holds. */
  onApplyRoleRequest?: () => void;
  onSignIn?: () => void;
  onSignOut?: () => void;
}

export function SiteTopNavBar({
  isAuthenticated = false,
  userName,
  portalEntry = 'none',
  onApplyRoleRequest,
  onSignIn,
  onSignOut,
}: SiteTopNavBarProps) {
  const palette = getRescueColorScheme(useTheme()).adminShell.topNavBar;

  return (
    <Box
      component="header"
      sx={{
        width: '100%',
        minWidth: 0,
        height: 64,
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr) auto',
        alignItems: 'center',
        columnGap: 3,
        px: { xs: 3, tablet: '16px', desktop: '32px' },
        bgcolor: palette.frame,
        borderBottom: `1px solid ${palette.border}`,
      }}
    >
      <Stack sx={{ flexDirection: 'row', alignItems: 'center', gap: 1.25 }}>
        <GuangFuBrandIcon width={38} height={26} />
        <Typography
          sx={{
            color: palette.brandText,
            fontSize: displayTextSize[16],
            lineHeight: '24px',
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}
        >
          島嶼守望
        </Typography>
        {portalEntry === 'backOffice' ? <SiteRealmBadge /> : null}
        <SitePortalSwitch entry={portalEntry} onApply={onApplyRoleRequest} />
      </Stack>

      <Box
        sx={{
          minWidth: 0,
          display: 'flex',
          justifyContent: 'center',
          px: { tablet: 1.5, desktop: 3 },
        }}
      >
        <Suspense fallback={<SiteHeaderSearchInputFallback />}>
          <SiteHeaderSearchInput />
        </Suspense>
      </Box>

      <Stack
        direction="row"
        spacing={1.5}
        sx={{ alignItems: 'center', justifySelf: 'end' }}
      >
        <RequestHelpButton />
        {/* The site's pages have no title to sit beside, so here. */}
        <PageHelpButton ringColor={palette.frame} />
        {isAuthenticated ? (
          <SiteNotifyBell size={36} ringColor={palette.frame} />
        ) : null}
        {isAuthenticated ? (
          <SiteUserMenu userName={userName} onSignOut={onSignOut} />
        ) : (
          <ButtonBase
            disableRipple
            aria-label="登入"
            onClick={onSignIn}
            sx={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              color: palette.brandText,
              transition: 'box-shadow 120ms ease',
              '&:hover': {
                boxShadow: `0 0 0 3px ${palette.avatarHover}`,
              },
            }}
          >
            <LoginRoundedIcon sx={{ fontSize: 20 }} />
          </ButtonBase>
        )}
      </Stack>
    </Box>
  );
}
