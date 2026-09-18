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
import {
  SiteHeaderSearchInput,
  SiteHeaderSearchInputFallback,
} from './header-search-input';
import { SiteUserMenu } from './user-menu';

const { color, typography } = designTokens;

/**
 * 場域標籤：只回答「我現在在前台」。
 *
 * 靜態、不可點 —— 旁邊將來會有「前往後台」切換鈕，可點的長相會讓兩者混淆。
 * 未登入者也顯示，因為這是狀態資訊，不是權限控制項。
 * 只放桌機：手機頂欄 56px 高、360px 寬，已經被漢堡、品牌、搜尋、使用者選單佔滿。
 */
function SiteRealmBadge() {
  return (
    <Box
      component="span"
      title="你目前在前台公開頁面"
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
      公開頁面
    </Box>
  );
}

/**
 * 前台桌機頂部導覽列：左側品牌與場域標籤，右側顯示系統身份與使用者選單。
 */
interface SiteTopNavBarProps {
  isAuthenticated?: boolean;
  userName?: string;
  userImage?: string;
  onSignIn?: () => void;
  onSignOut?: () => void;
}

export function SiteTopNavBar({
  isAuthenticated = false,
  userName,
  userImage,
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
        <SiteRealmBadge />
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
        {isAuthenticated ? (
          <SiteUserMenu
            userName={userName}
            userImage={userImage}
            onSignOut={onSignOut}
          />
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
